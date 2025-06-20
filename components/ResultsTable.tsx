
import React from 'react';
import { ProcessedProduct } from '../types';

interface ResultsTableProps {
  products: ProcessedProduct[];
}

const ResultsTable: React.FC<ResultsTableProps> = ({ products }) => {
  if (products.length === 0) {
    return <p className="text-gray-600">No hay productos para mostrar.</p>;
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }); // Adjust currency as needed
  };

  return (
    <div className="overflow-x-auto bg-white shadow-md rounded-lg">
      <table className="min-w-full leading-normal table-zebra">
        <thead>
          <tr className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
            <th className="py-3 px-6 text-left">Producto</th>
            <th className="py-3 px-6 text-right">Costo Unit. Inicial</th>
            <th className="py-3 px-6 text-right">Cantidad</th>
            <th className="py-3 px-6 text-left">Tasa Arancelaria</th>
            <th className="py-3 px-6 text-right">Costo Inicial Total</th>
            <th className="py-3 px-6 text-right">Costo General Dist.</th>
            <th className="py-3 px-6 text-right">Costo Específico Dist.</th>
            <th className="py-3 px-6 text-right">Costo Acumulado (Generales)</th>
            <th className="py-3 px-6 text-right">Costo Final Total Prod.</th>
            <th className="py-3 px-6 text-right">Costo Unit. Final</th>
            <th className="py-3 px-6 text-right">Factor Incremento Unit.</th>
          </tr>
        </thead>
        <tbody className="text-gray-700 text-sm">
          {products.map((product, index) => {
            const finalUnitCost = product.quantity > 0 ? product.finalCost / product.quantity : 0;
            let costIncreaseFactor = "N/A";

            if (product.unitCost > 0 && product.quantity > 0 && finalUnitCost > 0) {
              costIncreaseFactor = (finalUnitCost / product.unitCost).toFixed(4) + "x"; // Changed to 4 decimal places
            } else if (product.unitCost === 0 && finalUnitCost > 0 && product.quantity > 0) {
              costIncreaseFactor = "Infinito"; // Or a very large number / "N/A"
            }
            // If product.quantity is 0, finalUnitCost is 0 or NaN, so factor remains "N/A"
            // If product.unitCost is 0 and finalUnitCost is 0, factor could be 1.0000x or N/A. Current logic yields N/A.

            return (
              <tr key={index} className="border-b border-gray-200 hover:bg-blue-50">
                <td className="py-3 px-6 text-left whitespace-nowrap">{product.name}</td>
                <td className="py-3 px-6 text-right">{formatCurrency(product.unitCost)}</td>
                <td className="py-3 px-6 text-right">{product.quantity}</td>
                <td className="py-3 px-6 text-left">{product.tariffRate}</td>
                <td className="py-3 px-6 text-right">{formatCurrency(product.initialCost)}</td>
                <td className="py-3 px-6 text-right">{formatCurrency(product.allocatedGeneralCostSum)}</td>
                <td className="py-3 px-6 text-right">{formatCurrency(product.allocatedSpecificCostSum)}</td>
                <td className="py-3 px-6 text-right font-semibold">{formatCurrency(product.costAfterGeneralServices)}</td>
                <td className="py-3 px-6 text-right font-bold text-blue-600">{formatCurrency(product.finalCost)}</td>
                <td className="py-3 px-6 text-right font-bold text-green-600">
                  {product.quantity > 0 ? formatCurrency(finalUnitCost) : "N/A"}
                </td>
                <td className="py-3 px-6 text-right font-medium text-purple-600">{costIncreaseFactor}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ResultsTable;
