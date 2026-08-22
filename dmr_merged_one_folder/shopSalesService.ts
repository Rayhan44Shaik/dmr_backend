import type { ShopSale } from "../types/shopSale";

const STORAGE_KEY = "shopSales";

/* =========================================
   Read Shop Sales
========================================= */

function getSales(): ShopSale[] {

  const json = localStorage.getItem(STORAGE_KEY);

  if (!json)
    return [];

  return JSON.parse(json);

}

/* =========================================
   Save Shop Sales
========================================= */

function saveSales(

  sales: ShopSale[]

) {

  localStorage.setItem(

    STORAGE_KEY,

    JSON.stringify(sales)

  );

}

/* =========================================
   Get All
========================================= */

function getAll(): ShopSale[] {

  return getSales();

}

/* =========================================
   Get One
========================================= */

function getById(

  id: string

): ShopSale | undefined {

  return getSales().find(

    x => x.id === id

  );

}

/* =========================================
   Save Entire Register
========================================= */

function saveAll(

  sales: ShopSale[]

) {

  saveSales(sales);

}

/* =========================================
   Remove One
========================================= */

function remove(

  id: string

) {

  const sales = getSales().filter(

    x => x.id !== id

  );

  saveSales(sales);

}

/* =========================================
   Clear
========================================= */

function clear() {

  localStorage.removeItem(

    STORAGE_KEY

  );

}

/* =========================================
   Export
========================================= */

export const shopSalesService = {

  getAll,

  getById,

  saveAll,

  remove,

  clear

};