import { readFileSync } from "fs";
import { renderMenu } from "../lib/intelligence/fundSelection";
const fx = JSON.parse(readFileSync(`fixtures/gate1_holdout.json`, "utf8"));
const c = fx.cases[0];
const menu = renderMenu({ country: c.country, sector: c.sector, description: c.description, subset: c.subset, baselineTop5: c.baselineTop5 });
console.log(menu.slice(0, 4000));
