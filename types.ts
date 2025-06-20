export interface Product {
  name: string;
  unitCost: number;
  quantity: number;
  tariffRate: string; // Identifier for tariff category, e.g., "ELECTRONICA_T1", or a general category.
}

// ServiceType enum is no longer needed.
// export enum ServiceType {
//   GENERAL = 'GENERAL',
//   TARIFF_SPECIFIC = 'TARIFF_SPECIFIC',
// }

export interface Service {
  providerName: string;
  serviceName: string;
  cost: number;
  // type: ServiceType; // Removed
  // tariffRateMatcher?: string; // Removed
  distributionRule: string; // New field: holds "comun" or a specific tariff_rate like "arancel1"
}

export interface ProcessedProduct extends Product {
  initialCost: number; // unitCost * quantity
  costAfterGeneralServices: number; // initialCost + allocated "comun" service costs
  finalCost: number; // costAfterGeneralServices + allocated specific tariff service costs
  allocatedGeneralCostSum: number; // Sum of "comun" costs allocated
  allocatedSpecificCostSum: number; // Sum of specific tariff costs allocated
}