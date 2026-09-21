export type BarcodeProductDraft = {
  barcode: string;
  name: string;
  brand: string | null;
  per100: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
  };
};

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function lookupBarcodeProduct(rawBarcode: string): Promise<BarcodeProductDraft> {
  const barcode = rawBarcode.trim();
  if (!/^\d{6,14}$/.test(barcode)) throw new Error("Código de barras inválido.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const fields = "code,product_name,brands,nutriments";
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`,
      {
        headers: {
          "User-Agent": "ProjectEvolve/0.8 (https://github.com/CRAKI1/PROYECT-EVOLVE)",
          "Accept": "application/json",
        },
        signal: controller.signal,
      },
    );

    if (response.status === 404) throw new Error("Producto no encontrado en Open Food Facts.");
    if (!response.ok) throw new Error(`Open Food Facts respondió con estado ${response.status}.`);

    const payload = object(await response.json());
    const product = object(payload?.product);
    if (!product) throw new Error("La respuesta del producto no contiene datos utilizables.");

    const nutriments = object(product.nutriments) ?? {};
    const productName = typeof product.product_name === "string" ? product.product_name.trim() : "";
    const brands = typeof product.brands === "string" ? product.brands.trim() : "";

    return {
      barcode,
      name: productName || "Producto sin nombre",
      brand: brands || null,
      per100: {
        calories: finiteNonNegative(nutriments["energy-kcal_100g"]),
        protein: finiteNonNegative(nutriments["proteins_100g"]),
        carbs: finiteNonNegative(nutriments["carbohydrates_100g"]),
        fat: finiteNonNegative(nutriments["fat_100g"]),
        fiber: finiteNonNegative(nutriments["fiber_100g"]),
      },
    };
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error("La búsqueda del producto tardó demasiado.");
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}
