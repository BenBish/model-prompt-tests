export interface StockRecord {
  sku: string;
  available: number;
  reserved: number;
}

export interface Order {
  id: string;
  sku: string;
  quantity: number;
}
