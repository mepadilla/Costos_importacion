
import React, { useState, useCallback } from 'react';
import { Product, Service, ProcessedProduct } from './types'; // ServiceType removed from import
import FileUpload from './components/FileUpload';
import ResultsTable from './components/ResultsTable';
import Spinner from './components/Spinner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

// Helper interface for the structure of jsPDF's 'internal' property
interface JSPDFInternalProps {
  pageSize: {
    height: number;
    width: number;
    getHeight: () => number;
    getWidth: () => number;
  };
  getNumberOfPages: () => number;
  scaleFactor: number;
}

// Interface declaring common jsPDF methods and properties used in this component
// This helps TypeScript understand the shape of the jsPDF instance if default types are problematic.
interface CustomPDFOperations {
  internal: JSPDFInternalProps;
  setFontSize(size: number): this;
  text(text: string | string[], x: number, y: number, options?: any): this;
  addPage(): this;
  setPage(pageNumber: number): this;
  getStringUnitWidth(text: string): number;
  getFontSize(): number;
  setTextColor(r: number, g: number, b: number): this;
  setTextColor(grayScaleColor: number): this; // Overload for grayscale
  textWithLink(text: string, x: number, y: number, options: any): this;
  save(filename: string): void;
}

// Extend our custom operations interface instead of directly extending the imported jsPDF type
// if the imported type is causing issues.
interface jsPDFAugmented extends CustomPDFOperations {
  lastAutoTable?: {
    finalY?: number;
    [key: string]: any; 
  };
}

const App: React.FC = () => {
  const [productsFileContent, setProductsFileContent] = useState<string>('');
  const [servicesFileContent, setServicesFileContent] = useState<string>('');
  const [processedProducts, setProcessedProducts] = useState<ProcessedProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [totalProductCost, setTotalProductCost] = useState<number | null>(null);
  const [totalServiceCost, setTotalServiceCost] = useState<number | null>(null);
  const [totalGlobalCost, setTotalGlobalCost] = useState<number | null>(null);

  const [inputProducts, setInputProducts] = useState<Product[] | null>(null);
  const [inputServices, setInputServices] = useState<Service[] | null>(null);


  const formatCurrency = (value: number | null | undefined, placeholder = 'N/A') => {
    if (value === null || value === undefined || isNaN(value)) {
        return placeholder;
    }
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });
  };
  
  const formatCurrencyForPDF = (value: number | null | undefined, placeholder = 'N/A') => {
    if (value === null || value === undefined || isNaN(value)) {
        return placeholder;
    }
    return `USD ${value.toFixed(4)}`;
  };


  const parseProductsFile = (content: string): Product[] => {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return lines.map((line, index) => {
      const parts = line.split(',');
      if (parts.length !== 4) {
        throw new Error(`Error en archivo de productos, línea ${index + 1}: Se esperan 4 campos (Nombre,CostoUnitario,Cantidad,TasaArancelaria). Encontrado: "${line}"`);
      }
      const [name, unitCostStr, quantityStr, tariffRate] = parts.map(p => p.trim());
      const unitCost = parseFloat(unitCostStr);
      const quantity = parseInt(quantityStr, 10);

      if (isNaN(unitCost) || unitCost < 0) throw new Error(`Error en archivo de productos, línea ${index + 1}: Costo unitario inválido "${unitCostStr}".`);
      if (isNaN(quantity) || quantity < 0) throw new Error(`Error en archivo de productos, línea ${index + 1}: Cantidad inválida "${quantityStr}".`);
      if (!name) throw new Error(`Error en archivo de productos, línea ${index + 1}: Nombre del producto no puede estar vacío.`);
      if (!tariffRate) throw new Error(`Error en archivo de productos, línea ${index + 1}: Tasa arancelaria no puede estar vacía (usar "comun" si aplica a todos o un ID específico).`); // Updated help text slightly for clarity if products also use "comun"
      
      return { name, unitCost, quantity, tariffRate };
    });
  };

  const parseServicesFile = (content: string): Service[] => {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return lines.map((line, index) => {
      const parts = line.split(',');
      if (parts.length !== 4) { // Expecting 4 fields now
        throw new Error(`Error en archivo de servicios, línea ${index + 1}: Se esperan 4 campos (Proveedor,Servicio,Costo,TasaArancelariaAsignada). Encontrado: "${line}"`);
      }
      const providerName = parts[0].trim();
      const serviceName = parts[1].trim();
      const costStr = parts[2].trim();
      const distributionRule = parts[3].trim(); // This is the "TasaArancelariaAsignada"
      
      const cost = parseFloat(costStr);

      if (isNaN(cost) || cost < 0) throw new Error(`Error en archivo de servicios, línea ${index + 1}: Costo de servicio inválido "${costStr}".`);
      if (!providerName) throw new Error(`Error en archivo de servicios, línea ${index + 1}: Nombre de proveedor no puede estar vacío.`);
      if (!serviceName) throw new Error(`Error en archivo de servicios, línea ${index + 1}: Nombre de servicio no puede estar vacío.`);
      if (!distributionRule) throw new Error(`Error en archivo de servicios, línea ${index + 1}: Tasa arancelaria asignada (4ta columna) no puede estar vacía. Usar "comun" o un ID específico.`);

      return { providerName, serviceName, cost, distributionRule };
    });
  };
  
  const calculateDistributedCosts = useCallback((products: Product[], services: Service[]): ProcessedProduct[] => {
    // Initialize ProcessedProduct array
    let tempProcessedProducts: ProcessedProduct[] = products.map(p => ({
      ...p,
      initialCost: p.unitCost * p.quantity,
      costAfterGeneralServices: p.unitCost * p.quantity, // Start with initial cost
      finalCost: p.unitCost * p.quantity, // Start with initial cost
      allocatedGeneralCostSum: 0,
      allocatedSpecificCostSum: 0,
    }));

    // --- Step 1: Distribute "comun" (General) Services ---
    const comunServices = services.filter(s => s.distributionRule.toLowerCase() === 'comun');
    const totalComunServiceCost = comunServices.reduce((sum, s) => sum + s.cost, 0);
    const totalInitialProductValue = tempProcessedProducts.reduce((sum, p) => sum + p.initialCost, 0);

    if (totalComunServiceCost > 0 && totalInitialProductValue > 0) {
      tempProcessedProducts = tempProcessedProducts.map(p => {
        const allocatedGeneralCost = (p.initialCost / totalInitialProductValue) * totalComunServiceCost;
        return {
          ...p,
          costAfterGeneralServices: p.costAfterGeneralServices + allocatedGeneralCost,
          finalCost: p.finalCost + allocatedGeneralCost, // Update finalCost as well for now
          allocatedGeneralCostSum: p.allocatedGeneralCostSum + allocatedGeneralCost,
        };
      });
    }

    // --- Step 2: Distribute Specific Tariff Services ---
    const specificTariffRules = Array.from(new Set(
      services
        .filter(s => s.distributionRule.toLowerCase() !== 'comun')
        .map(s => s.distributionRule)
    ));

    specificTariffRules.forEach(specificRule => {
      const servicesForThisRule = services.filter(s => s.distributionRule === specificRule);
      const totalCostForThisRule = servicesForThisRule.reduce((sum, s) => sum + s.cost, 0);

      const matchingProducts = tempProcessedProducts.filter(p => p.tariffRate === specificRule);
      
      if (matchingProducts.length === 0) {
        console.warn(`Servicios con regla de distribución "${specificRule}" (costo total: ${totalCostForThisRule}) no coinciden con ningún producto. Este costo no será distribuido.`);
        return;
      }

      // Base for distribution of specific costs is costAfterGeneralServices
      const totalBaseCostForSpecificDistribution = matchingProducts.reduce((sum, p) => sum + p.costAfterGeneralServices, 0);

      if (totalCostForThisRule > 0 && totalBaseCostForSpecificDistribution > 0) {
        matchingProducts.forEach(mp => {
          const productIndex = tempProcessedProducts.findIndex(p => p.name === mp.name && p.tariffRate === mp.tariffRate && p.unitCost === mp.unitCost && p.quantity === mp.quantity); // More robust find
          if (productIndex !== -1) {
            const allocatedSpecificCost = (mp.costAfterGeneralServices / totalBaseCostForSpecificDistribution) * totalCostForThisRule;
            tempProcessedProducts[productIndex].finalCost += allocatedSpecificCost;
            tempProcessedProducts[productIndex].allocatedSpecificCostSum += allocatedSpecificCost;
          }
        });
      }
    });
    
    return tempProcessedProducts;
  }, []);

  const resetTotalsAndInputs = () => {
    setTotalProductCost(null);
    setTotalServiceCost(null);
    setTotalGlobalCost(null);
    setInputProducts(null);
    setInputServices(null);
  };

  const handleProcess = useCallback(async () => {
    if (!productsFileContent || !servicesFileContent) {
      setError("Por favor, cargue ambos archivos: productos y servicios.");
      setProcessedProducts(null);
      resetTotalsAndInputs();
      return;
    }
    setIsLoading(true);
    setError(null);
    setProcessedProducts(null);
    resetTotalsAndInputs();

    await new Promise(resolve => setTimeout(resolve, 100)); 

    try {
      const parsedProducts = parseProductsFile(productsFileContent);
      const parsedServices = parseServicesFile(servicesFileContent);
      
      setInputProducts(parsedProducts);
      setInputServices(parsedServices);

      if(parsedProducts.length === 0) {
        throw new Error("El archivo de productos no contiene datos válidos o está vacío.");
      }
      // Consider if services can be empty. For now, assume it's okay.

      const currentTotalProductCost = parsedProducts.reduce((sum, p) => sum + (p.unitCost * p.quantity), 0);
      const currentTotalServiceCost = parsedServices.reduce((sum, s) => sum + s.cost, 0);
      const currentTotalGlobalCost = currentTotalProductCost + currentTotalServiceCost;

      setTotalProductCost(currentTotalProductCost);
      setTotalServiceCost(currentTotalServiceCost);
      setTotalGlobalCost(currentTotalGlobalCost);

      const results = calculateDistributedCosts(parsedProducts, parsedServices);
      setProcessedProducts(results);

    } catch (e: any) {
      setError(e.message || "Ocurrió un error desconocido durante el procesamiento.");
      setProcessedProducts(null);
      resetTotalsAndInputs(); 
    } finally {
      setIsLoading(false);
    }
  }, [productsFileContent, servicesFileContent, calculateDistributedCosts, parseProductsFile, parseServicesFile]);


  const generatePDF = useCallback(() => {
    if (!processedProducts || !inputProducts || !inputServices || totalProductCost === null || totalServiceCost === null || totalGlobalCost === null) {
      setError("No hay datos suficientes para generar el PDF.");
      return;
    }
    setError(null);

    const doc = new jsPDF() as jsPDFAugmented; 
    const pageHeight = doc.internal.pageSize.getHeight() || doc.internal.pageSize.height; // Preferring getHeight/getWidth
    const pageWidth = doc.internal.pageSize.getWidth() || doc.internal.pageSize.width;
    let currentY = 20; 

    doc.setFontSize(18);
    doc.text("Informe de Costos de Importación", pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-ES')}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;

    doc.setFontSize(14);
    doc.text("Resumen de Costos Totales", 14, currentY);
    currentY += 8;
    doc.setFontSize(10);
    const summaryData = [
        ["Costo Total de Productos Comprados:", formatCurrencyForPDF(totalProductCost)],
        ["Costo Total de Servicios:", formatCurrencyForPDF(totalServiceCost)],
        ["Costo Total Global de Importación:", formatCurrencyForPDF(totalGlobalCost)],
    ];
    autoTable(doc, { 
        startY: currentY,
        head: [['Descripción', 'Monto']],
        body: summaryData,
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [75, 85, 99] }, 
        columnStyles: { 1: { halign: 'right' } },
    });
    currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10;


    if (currentY + 40 > pageHeight) { doc.addPage(); currentY = 20; } 
    doc.setFontSize(14);
    doc.text("Detalle de Productos Calculados", 14, currentY);
    currentY += 8;
    const processedProductsHeaders = [
      "Producto", "C.U. Ini.", "Cant.", "Tasa Aranc.", "C.Ini.Total", "C.Gen.Dist.", "C.Esp.Dist.", "C.Acum.(Gen)", "C.Fin.Total", "C.U.Final", "Factor Inc."
    ];
    const processedProductsBody = processedProducts.map(p => {
        const finalUnitCost = p.quantity > 0 ? p.finalCost / p.quantity : 0;
        let factor = "N/A";
        if (p.unitCost > 0 && p.quantity > 0 && finalUnitCost > 0) {
            factor = (finalUnitCost / p.unitCost).toFixed(4) + "x"; // Changed to 4 decimal places
        } else if (p.unitCost === 0 && finalUnitCost > 0 && p.quantity > 0) {
            factor = "Infinito"; 
        }

        return [
            p.name,
            formatCurrencyForPDF(p.unitCost),
            p.quantity,
            p.tariffRate,
            formatCurrencyForPDF(p.initialCost),
            formatCurrencyForPDF(p.allocatedGeneralCostSum),
            formatCurrencyForPDF(p.allocatedSpecificCostSum),
            formatCurrencyForPDF(p.costAfterGeneralServices),
            formatCurrencyForPDF(p.finalCost),
            formatCurrencyForPDF(finalUnitCost),
            factor
        ];
    });
    autoTable(doc, { 
        startY: currentY,
        head: [processedProductsHeaders],
        body: processedProductsBody,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 41, 59], fontSize: 6.5 }, 
        columnStyles: {
            0: { cellWidth: 30 }, 
            1: { halign: 'right' }, 2: { halign: 'right' },
            4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
            7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' },
            10: { halign: 'right'},
        },
        didDrawPage: (data) => { currentY = data.cursor?.y ? data.cursor.y + 10 : 20; } 
    });
    currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10;


    if (currentY + 40 > pageHeight) { doc.addPage(); currentY = 20; }
    doc.setFontSize(14);
    doc.text("Productos Cargados (Entrada)", 14, currentY);
    currentY += 8;
    const inputProductsHeaders = ["Nombre Producto", "Costo Unitario", "Cantidad", "Tasa Arancelaria"];
    const inputProductsBody = inputProducts.map(p => [
        p.name,
        formatCurrencyForPDF(p.unitCost),
        p.quantity,
        p.tariffRate
    ]);
    autoTable(doc, { 
        startY: currentY,
        head: [inputProductsHeaders],
        body: inputProductsBody,
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [75, 85, 99] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        didDrawPage: (data) => { currentY = data.cursor?.y ? data.cursor.y + 10 : 20; }
    });
    currentY = (doc.lastAutoTable?.finalY ?? currentY) + 10;

    if (currentY + 40 > pageHeight) { doc.addPage(); currentY = 20; }
    doc.setFontSize(14);
    doc.text("Servicios Cargados (Entrada)", 14, currentY);
    currentY += 8;
    // Updated headers and body for services table in PDF
    const inputServicesHeaders = ["Proveedor", "Servicio", "Costo", "Regla de Distribución"];
    const inputServicesBody = inputServices.map(s => [
        s.providerName,
        s.serviceName,
        formatCurrencyForPDF(s.cost),
        s.distributionRule 
    ]);
    autoTable(doc, { 
        startY: currentY,
        head: [inputServicesHeaders],
        body: inputServicesBody,
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [75, 85, 99] },
        columnStyles: { 2: { halign: 'right' } },
        didDrawPage: (data) => { currentY = data.cursor?.y ? data.cursor.y + 10 : 20; }
    });

    const pageCount = doc.internal.getNumberOfPages();
    const currentYear = new Date().getFullYear();
    const developedByPrefix = `© ${currentYear} - Desarrollado por `;
    const authorName = "Ing. Melvin E. Padilla";
    const linkedInUrl = "https://www.linkedin.com/in/melvin-padilla-3425106";

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); 

      const pdfPageWidth = doc.internal.pageSize.getWidth();
      const pdfPageHeight = doc.internal.pageSize.getHeight();
      const footerY = pdfPageHeight - 10; 
      const footerXMargin = 14; 

      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128); 

      doc.text(developedByPrefix, footerXMargin, footerY);
      
      const prefixWidth = doc.getStringUnitWidth(developedByPrefix) * doc.getFontSize() / doc.internal.scaleFactor;
      const linkedNameX = footerXMargin + prefixWidth;

      doc.setTextColor(0, 102, 204); 
      doc.textWithLink(authorName, linkedNameX, footerY, { url: linkedInUrl });
      
      doc.setTextColor(128, 128, 128); 
    }

    doc.save(`InformeCostosImportacion_${new Date().toISOString().split('T')[0]}.pdf`);

  }, [processedProducts, inputProducts, inputServices, totalProductCost, totalServiceCost, totalGlobalCost, formatCurrencyForPDF]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 py-8 px-4 sm:px-6 lg:px-8 text-gray-200">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-cyan-300">
            Calculadora de Costos de Importación
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            Distribuya costos de servicios y aranceles para determinar el costo final de sus productos.
          </p>
        </header>

        <div className="bg-slate-800 shadow-2xl rounded-xl p-6 md:p-10 mb-8">
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="bg-slate-700 p-6 rounded-lg shadow-inner">
                <h2 className="text-xl font-semibold mb-3 text-sky-400">Archivo de Productos</h2>
                <FileUpload
                id="productsFile"
                label="Cargar archivo de productos (.csv)"
                onFileContent={setProductsFileContent}
                helpText="Archivo CSV. Formato por línea: NombreProducto,CostoUnitario,Cantidad,TasaArancelariaID (ej: Laptop,1200,10,ELECTRO_T1)"
                />
            </div>
            <div className="bg-slate-700 p-6 rounded-lg shadow-inner">
                <h2 className="text-xl font-semibold mb-3 text-sky-400">Archivo de Servicios</h2>
                <FileUpload
                id="servicesFile"
                label="Cargar archivo de servicios (.csv)"
                onFileContent={setServicesFileContent}
                helpText="Archivo CSV. Formato: Proveedor,Servicio,Costo,ReglaDistribucion (ej: AgenteX,Flete,100,comun ó AduanaY,ImpuestoIVA,50,ELECTRO_T1)"
                />
            </div>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={handleProcess}
              disabled={isLoading || !productsFileContent || !servicesFileContent}
              className="px-8 py-3 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-sky-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mx-auto"
              aria-label="Calcular costos de importación"
            >
              {isLoading && <Spinner />}
              {isLoading ? 'Procesando...' : 'Calcular Costos'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-700 border border-red-500 text-red-100 rounded-md shadow-lg" role="alert">
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline ml-2">{error}</span>
          </div>
        )}

        {processedProducts && !error && (
          <div className="mt-10 bg-slate-800 shadow-2xl rounded-xl p-2 md:p-4">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 px-2 sm:px-0">
                <h2 className="text-2xl font-semibold text-sky-400 mb-4 sm:mb-0 text-center sm:text-left">Resultados del Cálculo</h2>
                <button
                    onClick={generatePDF}
                    disabled={!processedProducts || isLoading}
                    className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-emerald-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label="Descargar informe en PDF"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                    </svg>
                    Descargar Informe PDF
                </button>
            </div>
            
            {totalProductCost !== null && totalServiceCost !== null && totalGlobalCost !== null && (
              <div className="mb-8 bg-slate-700 p-6 rounded-lg shadow-md mx-auto max-w-2xl">
                <h3 className="text-xl font-semibold mb-4 text-sky-300 text-center">Resumen de Costos Totales</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Costo Total de Productos Comprados:</span>
                    <span className="font-semibold text-lg text-sky-200">{formatCurrency(totalProductCost)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Costo Total de Servicios:</span>
                    <span className="font-semibold text-lg text-sky-200">{formatCurrency(totalServiceCost)}</span>
                  </div>
                  <hr className="border-slate-600 my-3" />
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-bold text-slate-100">Costo Total Global de Importación:</span>
                    <span className="font-extrabold text-xl text-sky-400">{formatCurrency(totalGlobalCost)}</span>
                  </div>
                </div>
              </div>
            )}

            <ResultsTable products={processedProducts} />
          </div>
        )}
      </div>
       <footer className="text-center mt-12 py-6 border-t border-slate-700">
        <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} - Desarrollado por{' '}
            <a 
              href="https://www.linkedin.com/in/melvin-padilla-3425106" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sky-400 hover:text-sky-300 underline"
            >
              Ing. Melvin E. Padilla
            </a>
        </p>
      </footer>
    </div>
  );
};

export default App;
