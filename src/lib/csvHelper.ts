import Papa from 'papaparse';
import { Product, PurchaseOrder } from '../types';

export function downloadProductsCsvTemplate(): void {
  const headers = [
    'sku',
    'product_name',
    'gtin',
    'variant',
    'colour',
    'expected_units_per_carton',
    'description',
    'required_components',
  ];
  const sampleRow = [
    'SKU-1001',
    'Stainless Water Bottle 750ml',
    '08901234567890',
    'Standard',
    'Matte Black',
    '12',
    '750ml vacuum insulated bottle with carabiner lid',
    'Bottle|Lid|Carabiner',
  ];

  const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'dockproof_products_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadPurchaseOrdersCsvTemplate(): void {
  const headers = [
    'po_number',
    'supplier_code',
    'expected_arrival_date',
    'sku',
    'expected_cartons',
    'expected_units_per_carton',
    'notes',
  ];
  const sampleRow = [
    'PO-90001',
    'SUP-001',
    new Date().toISOString().split('T')[0],
    'SKU-1001',
    '5',
    '12',
    'Expedited shipment via air freight',
  ];

  const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'dockproof_purchase_orders_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseProductsCsv(
  fileContent: string
): { products: Partial<Product>[]; errors: string[] } {
  const result = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
  const errors: string[] = [];
  const products: Partial<Product>[] = [];

  result.data.forEach((row: any, idx: number) => {
    const rowNum = idx + 2;
    if (!row.sku || !row.product_name || !row.gtin) {
      errors.push(`Row ${rowNum}: SKU, Product Name, and GTIN are required.`);
      return;
    }

    const units = parseInt(row.expected_units_per_carton, 10);
    if (isNaN(units) || units <= 0) {
      errors.push(`Row ${rowNum}: expected_units_per_carton must be a positive integer.`);
      return;
    }

    products.push({
      sku: String(row.sku).trim().toUpperCase(),
      product_name: String(row.product_name).trim(),
      gtin: String(row.gtin).trim(),
      variant: row.variant ? String(row.variant).trim() : 'Standard',
      colour: row.colour ? String(row.colour).trim() : 'N/A',
      expected_units_per_carton: units,
      description: row.description ? String(row.description).trim() : undefined,
      required_components: row.required_components
        ? String(row.required_components).split('|').map((s) => s.trim())
        : undefined,
      active: true,
      created_at: new Date().toISOString(),
    });
  });

  return { products, errors };
}

export function parsePurchaseOrdersCsv(
  fileContent: string
): { orders: Partial<PurchaseOrder>[]; errors: string[] } {
  const result = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
  const errors: string[] = [];
  const poMap = new Map<string, any>();

  result.data.forEach((row: any, idx: number) => {
    const rowNum = idx + 2;
    if (!row.po_number || !row.supplier_code || !row.sku) {
      errors.push(`Row ${rowNum}: po_number, supplier_code, and sku are required.`);
      return;
    }

    const cartons = parseInt(row.expected_cartons, 10);
    const unitsPerBox = parseInt(row.expected_units_per_carton, 10);
    if (isNaN(cartons) || cartons <= 0 || isNaN(unitsPerBox) || unitsPerBox <= 0) {
      errors.push(`Row ${rowNum}: expected_cartons and expected_units_per_carton must be positive integers.`);
      return;
    }

    const poKey = String(row.po_number).trim().toUpperCase();
    if (!poMap.has(poKey)) {
      poMap.set(poKey, {
        po_number: poKey,
        supplier_code: String(row.supplier_code).trim().toUpperCase(),
        expected_arrival_date: row.expected_arrival_date || new Date().toISOString().split('T')[0],
        status: 'OPEN',
        lines: [],
      });
    }

    const po = poMap.get(poKey);
    po.lines.push({
      sku: String(row.sku).trim().toUpperCase(),
      expected_cartons: cartons,
      expected_units_per_carton: unitsPerBox,
      expected_units: cartons * unitsPerBox,
      product_name: String(row.sku).trim(),
      gtin: '',
    });
  });

  return { orders: Array.from(poMap.values()), errors };
}
