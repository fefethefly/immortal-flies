import React from "react";
import { ColonyPortrait } from "./colony-portrait.jsx";

/** Static collectible surfaces share Colony's complete phenotype renderer. */
export function CatalogPortrait({ soul, className = "" }) {
  return (
    <ColonyPortrait soul={soul} className={`catalog-portrait ${className}`} />
  );
}
