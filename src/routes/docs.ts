import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openapi = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../docs/openapi.json"), "utf8")
);

export const docsRouter = Router();

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(openapi);
});

docsRouter.use("/", swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: "DMR Poultries API Docs",
}));
