import { jsPDF } from "jspdf";

type RGB = [number, number, number];

export type DmrPdfOrientation =
  | "portrait"
  | "landscape";

export type PreparedHeaderImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type DmrPoultryHeaderAssets = {
  hen?: PreparedHeaderImage;
};

export interface DmrPoultryHeaderOptions {
  /** Left/right page margin in the same unit used by the jsPDF document. */
  margin?: number;

  /** Top edge of the header. */
  top?: number;

  /** Optional hen image URL. Its outer background is removed automatically. */
  henUrl?: string;

  /** Optional business-name override. */
  businessName?: string;

  /** Optional proprietor-name override. */
  proprietorName?: string;

  /** Optional mobile-number override. */
  mobileNumber?: string;

  /** Optional email-address override. */
  emailAddress?: string;

  /** Optional address override. */
  address?: string;
}

export const DMR_POULTRY_DETAILS = {
  businessName: "DMR POULTRIES",
  proprietorName: "D. Srinivas Chakrapani",
  mobileNumber: "+91 98484 17474",
  emailAddress: "dmrpoultries@gmail.com",
  address:
    "Madhira Rd, Peddapuram, Andhra Pradesh 521181",
} as const;

const NAVY: RGB = [15, 35, 79];
const RED: RGB = [178, 20, 34];
const MUTED: RGB = [75, 85, 99];

/**
 * Creates a compressed ISO A4 PDF using millimetres.
 */
export function createDmrPoultryPdf(
  orientation:
    DmrPdfOrientation = "portrait",
): jsPDF {
  return new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
}

const setFill = (
  doc: jsPDF,
  color: RGB,
): void => {
  doc.setFillColor(
    color[0],
    color[1],
    color[2],
  );
};

const setDraw = (
  doc: jsPDF,
  color: RGB,
): void => {
  doc.setDrawColor(
    color[0],
    color[1],
    color[2],
  );
};

const setText = (
  doc: jsPDF,
  color: RGB,
): void => {
  doc.setTextColor(
    color[0],
    color[1],
    color[2],
  );
};

/**
 * Draws a subtle vector call icon without requiring an icon font.
 */
function drawCallIcon(
  doc: jsPDF,
  x: number,
  y: number,
  size = 4.1,
): void {
  doc.saveGraphicsState();

  setDraw(doc, MUTED);
  doc.setLineWidth(0.22);

  doc.roundedRect(
    x + size * 0.2,
    y,
    size * 0.58,
    size,
    0.38,
    0.38,
    "S",
  );

  doc.line(
    x + size * 0.35,
    y + size * 0.18,
    x + size * 0.63,
    y + size * 0.18,
  );

  doc.circle(
    x + size * 0.49,
    y + size * 0.82,
    size * 0.045,
    "S",
  );

  doc.restoreGraphicsState();
}

/**
 * Draws a subtle vector email icon without requiring an icon font.
 */
function drawMailIcon(
  doc: jsPDF,
  x: number,
  y: number,
  width = 4.6,
): void {
  const height =
    width * 0.65;

  doc.saveGraphicsState();

  setDraw(doc, MUTED);
  doc.setLineWidth(0.2);

  doc.roundedRect(
    x,
    y,
    width,
    height,
    0.28,
    0.28,
    "S",
  );

  doc.line(
    x + 0.18,
    y + 0.22,
    x + width / 2,
    y + height * 0.58,
  );

  doc.line(
    x + width - 0.18,
    y + 0.22,
    x + width / 2,
    y + height * 0.58,
  );

  doc.restoreGraphicsState();
}

function loadImage(
  src: string,
): Promise<HTMLImageElement> {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.crossOrigin =
        "anonymous";

      image.onload = () => {
        resolve(image);
      };

      image.onerror = () => {
        reject(
          new Error(
            `Unable to load header image: ${src}`,
          ),
        );
      };

      image.src = src;
    },
  );
}

function imageToCanvas(
  image: HTMLImageElement,
) {
  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    image.naturalWidth ||
    image.width;

  canvas.height =
    image.naturalHeight ||
    image.height;

  const context =
    canvas.getContext(
      "2d",
      {
        willReadFrequently:
          true,
      },
    );

  if (
    !context ||
    canvas.width === 0 ||
    canvas.height === 0
  ) {
    throw new Error(
      "Unable to create a canvas for the header image.",
    );
  }

  context.drawImage(
    image,
    0,
    0,
  );

  return {
    canvas,
    context,
  };
}

function getBorderBackground(
  pixels:
    Uint8ClampedArray,
  width: number,
  height: number,
): RGB {
  const channels: [
    number[],
    number[],
    number[],
  ] = [[], [], []];

  const step = Math.max(
    1,
    Math.floor(
      Math.min(
        width,
        height,
      ) / 100,
    ),
  );

  const sample = (
    x: number,
    y: number,
  ): void => {
    const offset =
      (y * width + x) *
      4;

    channels[0].push(
      pixels[offset],
    );

    channels[1].push(
      pixels[offset + 1],
    );

    channels[2].push(
      pixels[offset + 2],
    );
  };

  for (
    let x = 0;
    x < width;
    x += step
  ) {
    sample(x, 0);

    sample(
      x,
      height - 1,
    );
  }

  for (
    let y = 0;
    y < height;
    y += step
  ) {
    sample(0, y);

    sample(
      width - 1,
      y,
    );
  }

  const median = (
    values: number[],
  ): number => {
    values.sort(
      (
        first,
        second,
      ) =>
        first - second,
    );

    return (
      values[
        Math.floor(
          values.length /
            2,
        )
      ] ?? 0
    );
  };

  return [
    median(
      channels[0],
    ),
    median(
      channels[1],
    ),
    median(
      channels[2],
    ),
  ];
}

/**
 * Removes only background pixels connected to the outer image border.
 *
 * Interior feather, eye and shadow details are protected.
 */
export async function prepareHenCutout(
  src: string,
): Promise<PreparedHeaderImage> {
  const image =
    await loadImage(src);

  const {
    canvas,
    context,
  } = imageToCanvas(image);

  const width =
    canvas.width;

  const height =
    canvas.height;

  const imageData =
    context.getImageData(
      0,
      0,
      width,
      height,
    );

  const pixels =
    imageData.data;

  const background =
    getBorderBackground(
      pixels,
      width,
      height,
    );

  const luminance =
    background[0] *
      0.2126 +
    background[1] *
      0.7152 +
    background[2] *
      0.0722;

  const tolerance =
    luminance < 45
      ? 108
      : luminance > 215
        ? 42
        : 62;

  const pixelCount =
    width * height;

  const removed =
    new Uint8Array(
      pixelCount,
    );

  const queue =
    new Int32Array(
      pixelCount,
    );

  let queueStart = 0;
  let queueEnd = 0;

  const matchesBackground = (
    position: number,
  ): boolean => {
    const offset =
      position * 4;

    if (
      pixels[
        offset + 3
      ] === 0
    ) {
      return true;
    }

    return (
      Math.abs(
        pixels[offset] -
          background[0],
      ) <= tolerance &&
      Math.abs(
        pixels[
          offset + 1
        ] -
          background[1],
      ) <= tolerance &&
      Math.abs(
        pixels[
          offset + 2
        ] -
          background[2],
      ) <= tolerance
    );
  };

  const enqueue = (
    position: number,
  ): void => {
    if (
      removed[position] ||
      !matchesBackground(
        position,
      )
    ) {
      return;
    }

    removed[position] =
      1;

    queue[queueEnd] =
      position;

    queueEnd += 1;
  };

  // Add matching top and bottom border pixels.
  for (
    let x = 0;
    x < width;
    x += 1
  ) {
    enqueue(x);

    enqueue(
      (height - 1) *
        width +
        x,
    );
  }

  // Add matching left and right border pixels.
  for (
    let y = 0;
    y < height;
    y += 1
  ) {
    enqueue(
      y * width,
    );

    enqueue(
      y * width +
        width -
        1,
    );
  }

  // Flood-fill only the background connected to the border.
  while (
    queueStart <
    queueEnd
  ) {
    const position =
      queue[queueStart];

    queueStart += 1;

    const x =
      position % width;

    const y =
      Math.floor(
        position / width,
      );

    if (x > 0) {
      enqueue(
        position - 1,
      );
    }

    if (
      x + 1 <
      width
    ) {
      enqueue(
        position + 1,
      );
    }

    if (y > 0) {
      enqueue(
        position -
          width,
      );
    }

    if (
      y + 1 <
      height
    ) {
      enqueue(
        position +
          width,
      );
    }
  }

  const edge =
    new Uint8Array(
      pixelCount,
    );

  // Remove background and identify the first subject edge.
  for (
    let position = 0;
    position <
    pixelCount;
    position += 1
  ) {
    if (
      !removed[
        position
      ]
    ) {
      continue;
    }

    pixels[
      position * 4 + 3
    ] = 0;

    const x =
      position % width;

    const y =
      Math.floor(
        position / width,
      );

    if (
      x > 0 &&
      !removed[
        position - 1
      ]
    ) {
      edge[
        position - 1
      ] = 1;
    }

    if (
      x + 1 <
        width &&
      !removed[
        position + 1
      ]
    ) {
      edge[
        position + 1
      ] = 1;
    }

    if (
      y > 0 &&
      !removed[
        position - width
      ]
    ) {
      edge[
        position - width
      ] = 1;
    }

    if (
      y + 1 <
        height &&
      !removed[
        position + width
      ]
    ) {
      edge[
        position + width
      ] = 1;
    }
  }

  const secondEdge =
    new Uint8Array(
      pixelCount,
    );

  const markSecondEdge = (
    position: number,
  ): void => {
    if (
      !removed[position] &&
      !edge[position]
    ) {
      secondEdge[
        position
      ] = 1;
    }
  };

  // Feather the first edge.
  for (
    let position = 0;
    position <
    pixelCount;
    position += 1
  ) {
    if (
      !edge[position]
    ) {
      continue;
    }

    pixels[
      position * 4 + 3
    ] = Math.min(
      pixels[
        position * 4 + 3
      ],
      150,
    );

    const x =
      position % width;

    const y =
      Math.floor(
        position / width,
      );

    if (x > 0) {
      markSecondEdge(
        position - 1,
      );
    }

    if (
      x + 1 <
      width
    ) {
      markSecondEdge(
        position + 1,
      );
    }

    if (y > 0) {
      markSecondEdge(
        position -
          width,
      );
    }

    if (
      y + 1 <
      height
    ) {
      markSecondEdge(
        position +
          width,
      );
    }
  }

  // Feather the second edge to prevent a dark JPEG halo.
  for (
    let position = 0;
    position <
    pixelCount;
    position += 1
  ) {
    if (
      secondEdge[
        position
      ]
    ) {
      pixels[
        position * 4 + 3
      ] = Math.min(
        pixels[
          position *
            4 +
          3
        ],
        225,
      );
    }
  }

  context.putImageData(
    imageData,
    0,
    0,
  );

  // Find visible image bounds.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (
    let position = 0;
    position <
    pixelCount;
    position += 1
  ) {
    if (
      pixels[
        position * 4 + 3
      ] <= 8
    ) {
      continue;
    }

    const x =
      position % width;

    const y =
      Math.floor(
        position / width,
      );

    minX = Math.min(
      minX,
      x,
    );

    minY = Math.min(
      minY,
      y,
    );

    maxX = Math.max(
      maxX,
      x,
    );

    maxY = Math.max(
      maxY,
      y,
    );
  }

  if (
    maxX < minX ||
    maxY < minY
  ) {
    throw new Error(
      "The hen image did not contain a visible subject.",
    );
  }

  const padding =
    Math.max(
      2,
      Math.round(
        Math.min(
          width,
          height,
        ) * 0.006,
      ),
    );

  minX = Math.max(
    0,
    minX - padding,
  );

  minY = Math.max(
    0,
    minY - padding,
  );

  maxX = Math.min(
    width - 1,
    maxX + padding,
  );

  maxY = Math.min(
    height - 1,
    maxY + padding,
  );

  const cropWidth =
    maxX - minX + 1;

  const cropHeight =
    maxY - minY + 1;

  const cropped =
    document.createElement(
      "canvas",
    );

  cropped.width =
    cropWidth;

  cropped.height =
    cropHeight;

  const croppedContext =
    cropped.getContext(
      "2d",
    );

  if (
    !croppedContext
  ) {
    throw new Error(
      "Unable to crop the hen image.",
    );
  }

  croppedContext.drawImage(
    canvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return {
    dataUrl:
      cropped.toDataURL(
        "image/png",
      ),
    width: cropWidth,
    height: cropHeight,
  };
}

function drawSoftContactShadow(
  doc: jsPDF,
  centerX: number,
  baseY: number,
  width: number,
): void {
  doc.saveGraphicsState();

  const shades = [
    248,
    244,
    239,
    234,
  ];

  shades.forEach(
    (
      shade,
      index,
    ) => {
      const scale =
        1 -
        index * 0.16;

      doc.setFillColor(
        shade,
        shade,
        shade,
      );

      doc.ellipse(
        centerX,
        baseY,
        (width * scale) /
          2,
        1.35 * scale,
        "F",
      );
    },
  );

  doc.restoreGraphicsState();
}

/**
 * Draws a vector hen fallback when the source image is unavailable.
 */
function drawHenFallback(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  doc.saveGraphicsState();

  const centerX =
    x + width / 2;

  const centerY =
    y + height / 2;

  drawSoftContactShadow(
    doc,
    centerX,
    y + height - 1,
    width * 0.62,
  );

  doc.setFillColor(
    242,
    243,
    246,
  );

  doc.ellipse(
    centerX - 1,
    centerY + 2,
    width * 0.34,
    height * 0.28,
    "F",
  );

  doc.circle(
    centerX +
      width * 0.23,
    centerY -
      height * 0.2,
    height * 0.12,
    "F",
  );

  setFill(doc, RED);

  doc.circle(
    centerX +
      width * 0.23,
    centerY -
      height * 0.34,
    height * 0.045,
    "F",
  );

  doc.setFillColor(
    218,
    160,
    62,
  );

  doc.triangle(
    centerX +
      width * 0.34,
    centerY -
      height * 0.2,

    centerX +
      width * 0.46,
    centerY -
      height * 0.16,

    centerX +
      width * 0.34,
    centerY -
      height * 0.12,

    "F",
  );

  doc.restoreGraphicsState();
}

/**
 * Prepares the optional hen once for reuse on every PDF page.
 */
export async function prepareDmrPoultryHeaderAssets(
  options: Pick<
    DmrPoultryHeaderOptions,
    "henUrl"
  > = {},
): Promise<DmrPoultryHeaderAssets> {
  if (
    !options.henUrl
  ) {
    return {};
  }

  try {
    return {
      hen:
        await prepareHenCutout(
          options.henUrl,
        ),
    };
  } catch (error) {
    console.warn(
      "Unable to prepare the DMR header hen; using the vector fallback.",
      error,
    );

    return {};
  }
}

/**
 * Draws the reusable DMR POULTRIES letterhead.
 *
 * Layout:
 * - Left: proprietor, call and email details
 * - Centre: DMR POULTRIES with the complete address underneath
 * - Right: prepared hen image or vector fallback
 *
 * There is no left logo, OFFICE label, Mobile label or report subtitle.
 *
 * Returns the safe Y-coordinate for page content or AutoTable.
 */
export function drawPreparedDmrPoultryHeader(
  doc: jsPDF,
  options: Omit<
    DmrPoultryHeaderOptions,
    "henUrl"
  > = {},
  assets:
    DmrPoultryHeaderAssets = {},
): number {
  const pageWidth =
    doc.internal.pageSize.getWidth();

  const margin =
    options.margin ?? 12;

  const top =
    options.top ?? 9;

  const details = {
    businessName:
      options.businessName ??
      DMR_POULTRY_DETAILS.businessName,

    proprietorName:
      options.proprietorName ??
      DMR_POULTRY_DETAILS.proprietorName,

    mobileNumber:
      options.mobileNumber ??
      DMR_POULTRY_DETAILS.mobileNumber,

    emailAddress:
      options.emailAddress ??
      DMR_POULTRY_DETAILS.emailAddress,

    address:
      options.address ??
      DMR_POULTRY_DETAILS.address,
  };

  doc.saveGraphicsState();

  /*
   * LEFT-SIDE PROPRIETOR BLOCK
   */
  doc.setFont(
    "helvetica",
    "bold",
  );

  doc.setFontSize(8);
  setText(doc, RED);

  doc.text(
    "PROPRIETOR",
    margin,
    top + 2.8,
  );

  /*
   * LARGER PROPRIETOR NAME
   */
  doc.setFontSize(11.5);
  setText(doc, NAVY);

  doc.text(
    details.proprietorName,
    margin,
    top + 9,
  );

  /*
   * LIGHT PHONE ICON AND NUMBER
   *
   * Extra vertical space is kept between the proprietor name and phone row.
   */
  drawCallIcon(
    doc,
    margin,
    top + 11.7,
  );

  doc.setFont(
    "helvetica",
    "normal",
  );

  doc.setFontSize(8.5);
  setText(doc, MUTED);

  doc.text(
    details.mobileNumber,
    margin + 5.8,
    top + 15.2,
  );

  /*
   * LIGHT EMAIL ICON AND ADDRESS
   *
   * This row is placed lower to use the previously empty header space.
   */
  drawMailIcon(
    doc,
    margin,
    top + 17.8,
  );

  doc.setFontSize(8);
  setText(doc, MUTED);

  doc.text(
    details.emailAddress,
    margin + 5.8,
    top + 20.7,
  );

  /*
   * CENTRED BUSINESS NAME
   */
  doc.setFont(
    "helvetica",
    "bold",
  );

  doc.setFontSize(
    pageWidth < 240
      ? 23
      : 26,
  );

  setText(doc, NAVY);

  doc.text(
    details.businessName,
    pageWidth / 2,
    top + 10.7,
    {
      align: "center",
    },
  );

  /*
   * COMPLETE ADDRESS UNDER BUSINESS NAME
   */
  doc.setFont(
    "helvetica",
    "normal",
  );

  doc.setFontSize(
    pageWidth < 240
      ? 6.8
      : 7.3,
  );

  setText(doc, MUTED);

  const addressWidth =
    pageWidth < 240
      ? 88
      : 122;

  const addressLines =
    doc.splitTextToSize(
      details.address,
      addressWidth,
    ) as string[];

  doc.text(
    addressLines,
    pageWidth / 2,
    top + 16.3,
    {
      align: "center",
      lineHeightFactor: 1.15,
    },
  );

  /*
   * DECORATIVE DIVIDER
   */
  const dividerY =
    top + 23.5;

  const dividerHalfWidth =
    Math.min(
      50,
      pageWidth * 0.2,
    );

  setDraw(doc, RED);
  doc.setLineWidth(0.45);

  doc.line(
    pageWidth / 2 -
      dividerHalfWidth,
    dividerY,
    pageWidth / 2 - 12,
    dividerY,
  );

  doc.line(
    pageWidth / 2 + 12,
    dividerY,
    pageWidth / 2 +
      dividerHalfWidth,
    dividerY,
  );

  setFill(doc, RED);

  doc.circle(
    pageWidth / 2 - 4,
    dividerY,
    0.6,
    "F",
  );

  doc.circle(
    pageWidth / 2,
    dividerY,
    0.82,
    "F",
  );

  doc.circle(
    pageWidth / 2 + 4,
    dividerY,
    0.6,
    "F",
  );

  /*
   * RIGHT-SIDE HEN
   */
  const henWidth = 29;
  const henHeight = 27;

  const henX =
    pageWidth -
    margin -
    henWidth;

  const henY =
    top - 1;

  if (
    assets.hen
  ) {
    const ratio =
      Math.min(
        henWidth /
          assets.hen.width,

        henHeight /
          assets.hen.height,
      );

    const width =
      assets.hen.width *
      ratio;

    const height =
      assets.hen.height *
      ratio;

    const x =
      henX +
      (henWidth -
        width) /
        2;

    const y =
      henY +
      henHeight -
      height;

    drawSoftContactShadow(
      doc,
      x + width / 2,
      y + height - 0.3,
      width * 0.7,
    );

    doc.addImage(
      assets.hen.dataUrl,
      "PNG",
      x,
      y,
      width,
      height,
      undefined,
      "FAST",
    );
  } else {
    drawHenFallback(
      doc,
      henX,
      henY,
      henWidth,
      henHeight,
    );
  }

  /*
   * FULL-WIDTH BOTTOM BORDER
   */
  const baselineY =
    top + 29;

  setDraw(doc, NAVY);
  doc.setLineWidth(0.18);

  doc.line(
    margin,
    baselineY,
    pageWidth - margin,
    baselineY,
  );

  doc.restoreGraphicsState();

  return baselineY + 5;
}

/**
 * Convenience function for a PDF that supplies a hen URL.
 *
 * For a multi-page PDF, prepare the image once using
 * prepareDmrPoultryHeaderAssets() and reuse the returned asset with
 * drawPreparedDmrPoultryHeader().
 */
export async function drawDmrPoultryHeader(
  doc: jsPDF,
  options:
    DmrPoultryHeaderOptions = {},
): Promise<number> {
  const assets =
    await prepareDmrPoultryHeaderAssets(
      options,
    );

  return drawPreparedDmrPoultryHeader(
    doc,
    options,
    assets,
  );
}