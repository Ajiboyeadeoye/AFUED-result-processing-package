import mongoose from "mongoose";
import { Parser as Json2CsvParser } from "json2csv";
import XLSX from "xlsx";
import PDFDocument from 'pdfkit';
import archiver from 'archiver';

const ENABLE_PERFORMANCE_LOG = false
const DEBUG = true;
const originalConsoleLog = console.log;

console.log = DEBUG ? originalConsoleLog : () => {};
// Add this helper function at the top
const logWithTime = (message, startTime = null) => {
  if(ENABLE_PERFORMANCE_LOG){
      const timestamp = new Date().toISOString();
  if (startTime) {
    const duration = Date.now() - startTime;
    console.log(`⏱️ [${timestamp}] ${message} - ${duration}ms`);
    return duration;
  } else {
    console.log(`⏱️ [${timestamp}] ${message}`);
    return Date.now();
  }
  }

};

/* ------------------------------------------------------------
 * 🧠 QUERY BUILDER (with support for custom_fields)
 * ------------------------------------------------------------ */
const queryBuilder = (payload = {}, options = {}) => {
  // [Previous queryBuilder code remains exactly the same]
  const {
    page = 1,
    limit = 5,
    fields = [],
    search_term = "",
    filter = {},
    sort = { createdAt: -1 },
    extraParams = {},
  } = payload;
console.log(page)
  const enablePagination =
    options.enablePagination === undefined ? true : options.enablePagination;
  const additionalFilters = options.additionalFilters || {};
  const customFields = options.custom_fields || {};
  const defaultSort = options.sort || { createdAt: -1 };

  const currentPage = parseInt(page) || 1;
  const maxLimit = options.maxLimit || 100;
  const itemsPerPage = Math.min(Math.max(parseInt(limit) || 20, 1), maxLimit);
  const skip = (currentPage - 1) * itemsPerPage;

  let query = { ...filter, ...additionalFilters };

  if (fields.length && search_term) {
    const fieldArray = Array.isArray(fields) ? fields : String(fields).split(",");
    const regex = { $regex: search_term, $options: "i" };
    const orArray = [];

    for (const field of fieldArray) {
      const trimmed = field.trim();
      if (customFields[trimmed]) {
        const refName = customFields[trimmed];
        orArray.push({ [`${refName}.${trimmed}`]: regex });
      } else {
        orArray.push({ [trimmed]: regex });
      }
    }

    query.$or = orArray;
  }

  const finalSort = sort || defaultSort;

  return {
    query,
    finalSort,
    skip,
    itemsPerPage,
    enablePagination,
    extraParams,
    currentPage,
  };
};

/* ------------------------------------------------------------
 * 🧙 APPLY TRANSFORMATIONS
 * ------------------------------------------------------------ */
const applyTransformations = async (data, configMap) => {
  // [Previous applyTransformations code remains exactly the same]
  if (!configMap) return data;

  const models = mongoose.models;
  const resolvePath = (obj, path) =>
    path.split(".").reduce((o, k) => (o ? o[k] : null), obj);

  return Promise.all(
    data.map(async (doc) => {
      const transformed = {};
      for (const [key, value] of Object.entries(configMap)) {
        if (typeof value === "function") {
          transformed[key] = await value(doc, models);
        } else if (value.startsWith("this.")) {
          try {
            if (value.includes("||")) {
              const paths = value
                .split("||")
                .map(v => v.trim().replace(/^this\./, "").replace(/\?/g, ""));
              
              for (const p of paths) {
                const val = resolvePath(doc, p);
                if (val !== undefined && val !== null) {
                  transformed[key] = val;
                  break;
                }
              }
            } else {
              transformed[key] = resolvePath(doc, value.replace(/^this\./, "").replace(/\?/g, ""));
            }
          } catch {
            transformed[key] = null;
          }
        } else if (value.includes(".")) {
          const [ref, refField] = value.split(".");
          transformed[key] = doc[ref]?.[refField] ?? null;
        } else {
          transformed[key] = value;
        }
      }
      return transformed;
    })
  );
};

/* ------------------------------------------------------------
 * 🎨 ADVANCED EXPORT FORMATTERS
 * ------------------------------------------------------------ */
const exportFormatters = {
  // Format dates consistently
  date: (value, format = 'YYYY-MM-DD') => {
    if (!value) return '';
    const date = new Date(value);
    if (format === 'YYYY-MM-DD') return date.toISOString().split('T')[0];
    if (format === 'DD/MM/YYYY') return date.toLocaleDateString('en-GB');
    return date.toISOString();
  },
  
  // Format currency
  currency: (value, currency = 'USD') => {
    if (!value) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(value);
  },
  
  // Truncate long text
  truncate: (value, length = 50) => {
    if (!value) return '';
    return value.length > length ? value.substring(0, length) + '...' : value;
  },
  
  // Boolean to Yes/No
  boolean: (value) => value ? 'Yes' : 'No',
  
  // Array to comma-separated string
  array: (value, separator = ', ') => {
    if (!value) return '';
    return Array.isArray(value) ? value.join(separator) : String(value);
  }
};

/* ------------------------------------------------------------
 * 📊 DATA PREPROCESSOR FOR EXPORTS
 * ------------------------------------------------------------ */
const prepareExportData = (data, exportConfig = {}) => {
  const {
    fields = [], // Specific fields to include
    fieldLabels = {}, // Custom column names
    fieldFormatters = {}, // How to format each field
    excludeFields = [],
    includeMetadata = false
  } = exportConfig;

  if (!data || !data.length) return [];

  // Get all available fields if not specified
  const allFields = fields.length ? fields : Object.keys(data[0]);
  
  // Filter out excluded fields
  const finalFields = allFields.filter(field => !excludeFields.includes(field));

  return data.map(item => {
    const exportItem = {};
    
    finalFields.forEach(field => {
      let value = item[field];
      
      // Apply field-specific formatter
      if (fieldFormatters[field]) {
        const formatterConfig = fieldFormatters[field];
        if (typeof formatterConfig === 'function') {
          value = formatterConfig(value, item);
        } else if (exportFormatters[formatterConfig.type]) {
          value = exportFormatters[formatterConfig.type](
            value, 
            formatterConfig.options
          );
        }
      }
      
      // Use custom label or field name
      const columnName = fieldLabels[field] || field;
      exportItem[columnName] = value;
    });

    // Add metadata if requested
    if (includeMetadata) {
      exportItem._exportedAt = new Date().toISOString();
      exportItem._totalRecords = data.length;
    }

    return exportItem;
  });
};

/* ------------------------------------------------------------
 * 📁 ENHANCED EXPORT HANDLER (Multiple Formats + Advanced Features)
 * ------------------------------------------------------------ */
const exportHandler = async (res, modelName, data, exportConfig = {}) => {
  const {
    fileType = 'csv',
    fileName = `${modelName}_export_${Date.now()}`,
    fields = [],
    fieldLabels = {},
    fieldFormatters = {},
    excludeFields = [],
    includeMetadata = false,
    compression = false
  } = exportConfig;

  // Prepare data for export
  const exportData = prepareExportData(data, {
    fields,
    fieldLabels,
    fieldFormatters,
    excludeFields,
    includeMetadata
  });

  const lowerType = fileType.toLowerCase();

  try {
    // 📄 CSV Export with advanced options
    if (lowerType === 'csv') {
      const parser = new Json2CsvParser({
        fields: Object.keys(exportData[0] || {}),
        excelStrings: true,
        withBOM: true
      });
      const csv = parser.parse(exportData);
      
      res.header("Content-Type", "text/csv; charset=utf-8");
      res.attachment(`${fileName}.csv`);
      return res.send(csv);
    }

    // 📊 Excel Export with styling options
    if (["excel", "xlsx"].includes(lowerType)) {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      
      // Auto-size columns
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.max(
          key.length,
          ...exportData.map(row => String(row[key] || '').length)
        )
      }));
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
      const buffer = XLSX.write(workbook, { 
        type: "buffer", 
        bookType: "xlsx",
        compression: true
      });
      
      res.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.attachment(`${fileName}.xlsx`);
      return res.send(buffer);
    }

    // 📋 JSON Export with pretty print
    if (lowerType === 'json') {
      const exportObject = {
        metadata: {
          exportedAt: new Date().toISOString(),
          totalRecords: exportData.length,
          model: modelName
        },
        data: exportData
      };
      
      res.header("Content-Type", "application/json");
      res.attachment(`${fileName}.json`);
      return res.send(JSON.stringify(exportObject, null, 2));
    }

    // 📄 PDF Export (Tabular format)
    if (lowerType === 'pdf') {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          res.header("Content-Type", "application/pdf");
          res.attachment(`${fileName}.pdf`);
          resolve(res.send(pdfData));
        });
        
        // PDF Header
        doc.fontSize(20).text(`${modelName} Export`, 50, 50);
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, 50, 80);
        doc.moveDown();
        
        // Table data
        if (exportData.length > 0) {
          const headers = Object.keys(exportData[0]);
          let yPosition = 120;
          
          // Table headers
          doc.fontSize(8).fillColor('#333');
          headers.forEach((header, i) => {
            doc.text(header, 50 + (i * 120), yPosition, { width: 110, align: 'left' });
          });
          
          yPosition += 20;
          doc.moveTo(50, yPosition).lineTo(50 + (headers.length * 120), yPosition).stroke();
          yPosition += 10;
          
          // Table rows
          exportData.forEach((row, index) => {
            if (yPosition > 700) { // New page
              doc.addPage();
              yPosition = 50;
            }
            
            headers.forEach((header, i) => {
              doc.text(String(row[header] || ''), 50 + (i * 120), yPosition, { 
                width: 110, 
                align: 'left',
                height: 30
              });
            });
            
            yPosition += 30;
          });
        }
        
        doc.end();
      });
    }

    // 📦 ZIP Export (Multiple formats bundled)
    if (lowerType === 'zip') {
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      res.attachment(`${fileName}.zip`);
      archive.pipe(res);
      
      // Add multiple formats to zip
      const csvParser = new Json2CsvParser({ fields: Object.keys(exportData[0] || {}) });
      archive.append(csvParser.parse(exportData), { name: `${fileName}.csv` });
      
      archive.append(JSON.stringify(exportData, null, 2), { name: `${fileName}.json` });
      
      // Create and add Excel file
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
      const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      archive.append(excelBuffer, { name: `${fileName}.xlsx` });
      
      await archive.finalize();
      return;
    }

    // 📧 XML Export
    if (lowerType === 'xml') {
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += `<${modelName}Export date="${new Date().toISOString()}">\n`;
      
      exportData.forEach(item => {
        xml += `  <record>\n`;
        Object.entries(item).forEach(([key, value]) => {
          const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_');
          xml += `    <${safeKey}>${escapeXml(String(value))}</${safeKey}>\n`;
        });
        xml += `  </record>\n`;
      });
      
      xml += `</${modelName}Export>`;
      
      res.header("Content-Type", "application/xml");
      res.attachment(`${fileName}.xml`);
      return res.send(xml);
    }

    // 📋 TSV Export (Tab-separated values)
    if (lowerType === 'tsv') {
      const fields = Object.keys(exportData[0] || {});
      const tsv = [
        fields.join('\t'), // Header
        ...exportData.map(row => 
          fields.map(field => String(row[field] || '').replace(/\t/g, ' ')).join('\t')
        )
      ].join('\n');
      
      res.header("Content-Type", "text/tab-separated-values");
      res.attachment(`${fileName}.tsv`);
      return res.send(tsv);
    }

    return res.status(400).json({ message: "Unsupported file type" });

  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({ message: "Export failed", error: error.message });
  }
};

// Helper function for XML escaping
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/* ------------------------------------------------------------
 * ⚡ CORE DATA FETCHER
 * ------------------------------------------------------------ */
const fetchData = async (payload, Model, options = {}) => {
  const overallStart = logWithTime(`🚀 Starting fetchData for ${Model.modelName}`);
  
  const {
    query,
    finalSort,
    skip,
    itemsPerPage,
    enablePagination,
    extraParams,
    currentPage,
  } = queryBuilder(payload, options);

  // Detect if we're searching inside referenced custom_fields
  const queryBuildStart = logWithTime(`🔍 Analyzing query conditions`);
  const hasNestedSearch =
    options.custom_fields &&
    Object.keys(options.custom_fields).some((key) =>
      query.$or?.some?.((cond) =>
        Object.keys(cond)[0].startsWith(options.custom_fields[key] + ".")
      )
    );

  let dataQuery;
  const needsRefFilter =
    options.custom_fields &&
    Object.keys(options.additionalFilters || {}).some(
      (key) => key in options.custom_fields
    );

  const runPipeline = hasNestedSearch || needsRefFilter;
  logWithTime(`✅ Query analysis complete`, queryBuildStart);

  let pipelineBuildTime;
  if (runPipeline) {
    pipelineBuildTime = logWithTime(`🔄 Building aggregation pipeline`);
    
    const pipeline = [];

    // ✅ Base match
    const baseMatch = { ...query };
    delete baseMatch.$or;

    // 🔹 Determine deferred fields (those that belong to joined models)
    const deferredMatch = {};
    const joinedFields = Object.keys(options.custom_fields || {});
    for (const key in baseMatch) {
      if (joinedFields.includes(key)) {
        deferredMatch[`${options.custom_fields[key]}.${key}`] = baseMatch[key];
        delete baseMatch[key];
      }
    }

    // Push base match for fields in the main model
    if (Object.keys(baseMatch).length) pipeline.push({ $match: baseMatch });

    // ✅ Lookups for each ref in custom_fields
    for (const ref of new Set(Object.values(options.custom_fields || {}))) {
      let refPath = Model.schema.path(ref);
      let refModel = refPath?.options?.ref;
      let localField = ref;

      // 🧠 Handle fallback patterns like refId / ref_id
      if (!refModel) {
        const altPaths = [`${ref}Id`, `${ref}_id`];
        for (const alt of altPaths) {
          const altPath = Model.schema.path(alt);
          if (altPath?.options?.ref) {
            refPath = altPath;
            refModel = altPath.options.ref;
            localField = alt;
            break;
          }
        }
      }

      // 🪄 Handle shared _id references
      if (!refModel && ref === "_id") {
        const idPath = Model.schema.path("_id");
        if (idPath?.options?.ref) {
          refModel = idPath.options.ref;
          localField = "_id";
        }
      }

      if (!refModel) continue;

      pipeline.push({
        $lookup: {
          from: refModel.toLowerCase() + "s",
          localField,
          foreignField: "_id",
          as: ref,
        },
      });

      pipeline.push({
        $unwind: { path: `$${ref}`, preserveNullAndEmptyArrays: true },
      });
    }

    // 🔹 Apply deferred matches AFTER lookups
    if (Object.keys(deferredMatch).length) {
      pipeline.push({ $match: deferredMatch });
    }

    // ✅ Apply search conditions ($or)
    if (query.$or?.length) pipeline.push({ $match: { $or: query.$or } });

    // ✅ Sorting and pagination
    pipeline.push({ $sort: finalSort });
    if (enablePagination && !extraParams.asFile) {
      pipeline.push({ $skip: skip }, { $limit: itemsPerPage });
    }

    dataQuery = Model.aggregate(pipeline);
    logWithTime(`✅ Pipeline built with ${pipeline.length} stages`, pipelineBuildTime);
    console.log('📊 Pipeline stages:', pipeline.map(stage => Object.keys(stage)[0]));
    
  } else {
    const queryBuildStart = logWithTime(`🔧 Building find query`);
    
    // 🧠 Default behavior
    dataQuery = Model.find(query).sort(finalSort);

    // Custom populates
    if (options.populate) {
      for (const pop of [].concat(options.populate)) {
        dataQuery = dataQuery.populate(pop);
      }
    }

    // Auto-populate refs
    if (options.autoPopulate !== false) {
      const schemaPaths = Model.schema.paths;
      const populated = new Set(
        options.populate?.map((p) => p.path || p) || []
      );
      for (const key in schemaPaths) {
        const path = schemaPaths[key];
        if (path.options?.ref && !populated.has(key)) {
          dataQuery = dataQuery.populate({ path: key, select: "name" });
        }
      }
    }

    // Pagination
    if (enablePagination && !extraParams.asFile) {
      dataQuery = dataQuery.skip(skip).limit(itemsPerPage);
    }
    
    logWithTime(`✅ Find query built`, queryBuildStart);
  }

  // Execute query with timing
  const queryStart = logWithTime(`📡 Executing database query`);
  let data;

  try {
    if (typeof dataQuery.lean === "function") {
      data = await dataQuery.lean();
    } else {
      data = await dataQuery;
    }
    const queryTime = logWithTime(`✅ Database query completed`, queryStart);
    
    // Log query performance
    console.log(`📊 Query returned ${data?.length || 0} records in ${queryTime}ms`);
    
  } catch (error) {
    logWithTime(`❌ Database query failed`, queryStart);
    throw error;
  }

  // 🪄 Flatten custom fields with timing
  if (options.custom_fields && Array.isArray(data) && data.length) {
    const flattenStart = logWithTime(`🔄 Flattening custom fields`);
    data = data.map((item) => {
      const newItem = { ...item };
      for (const [field, parent] of Object.entries(options.custom_fields)) {
        const value = parent
          .split('.')
          .reduce((acc, key) => (acc ? acc[key] : undefined), item);
        if (value !== undefined) newItem[field] = value;
      }
      return newItem;
    });
    logWithTime(`✅ Custom fields flattened`, flattenStart);
  }

  // 🧠 Apply transformations with timing
  if (options.configMap) {
    const transformStart = logWithTime(`🎭 Applying transformations`);
    data = await applyTransformations(data, options.configMap);
    logWithTime(`✅ Transformations applied`, transformStart);
  }

  // 🧹 Remove excluded fields with timing
  if (Array.isArray(extraParams.excludeFields)) {
    const excludeStart = logWithTime(`🧹 Removing excluded fields`);
    data = data.map((item) => {
      extraParams.excludeFields.forEach((f) => delete item[f]);
      return item;
    });
    logWithTime(`✅ Excluded fields removed`, excludeStart);
  }

  // Get pagination info with timing
  let pagination = null;
  if (enablePagination && !extraParams.asFile) {
    const countStart = logWithTime(`🔢 Counting total documents`);
    const totalItems = await Model.countDocuments(query);
    logWithTime(`✅ Document count completed`, countStart);
    
    pagination = {
      current_page: currentPage,
      limit: itemsPerPage,
      total_pages: Math.ceil(totalItems / itemsPerPage),
      total_items: totalItems,
    };
  }

  const totalTime = logWithTime(`🎉 fetchData completed for ${Model.modelName}`, overallStart);
  
  // Performance summary
  console.log(`\n📈 PERFORMANCE SUMMARY for ${Model.modelName}:`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Records returned: ${data?.length || 0}`);
  console.log(`   Pagination enabled: ${enablePagination}`);
  console.log(`   Used aggregation: ${runPipeline}`);
  console.log(`   Current page: ${currentPage}`);
  console.log(`   Page size: ${itemsPerPage}\n`);

  return {
    data,
    pagination,
    queryInfo: {
      query,
      finalSort,
      currentPage,
      itemsPerPage,
      performance: {
        totalTime,
        recordsReturned: data?.length || 0,
        usedAggregation: runPipeline
      }
    }
  };
};

/* ------------------------------------------------------------
 * 🚀 SUPERCHARGED UNIVERSAL HELPER
 * ------------------------------------------------------------ */
export const fetchDataHelper = async (req, res, Model, options = {}) => {
  try {

    const payload = req.method === 'GET' ? req.query : req.body;
    const { returnType = 'response', ...fetchOptions } = options;

    // Get the data using the core fetcher
    const result = await fetchData(payload, Model, fetchOptions);
    const { data, pagination } = result;

    // Enhanced export handling
    const extraParams = payload.extraParams || {};
    if (extraParams.asFile) {
      if (returnType === 'object') {
        throw new Error('File export is only available with returnType: "response"');
      }

      // Enhanced export configuration
      const exportConfig = {
        fileType: extraParams.fileType || 'csv',
        fileName: extraParams.fileName || `${Model.modelName}_export_${Date.now()}`,
        fields: extraParams.fields, // Specific fields to export
        fieldLabels: extraParams.fieldLabels, // Custom column names
        fieldFormatters: extraParams.fieldFormatters, // How to format each field
        excludeFields: extraParams.excludeFields,
        includeMetadata: extraParams.includeMetadata,
        compression: extraParams.compression
      };

      return await exportHandler(res, Model.modelName, data, exportConfig);
    }

    // Return based on requested type
    if (returnType === 'object') {
      return {
        data,
        ...(pagination && { pagination }),
        ...(extraParams.includeQueryInfo && { queryInfo: result.queryInfo })
      };
    }

    // Default: return server response
    return res.status(200).json({
      message: `${Model.modelName} data fetched successfully`,
      ...(pagination ? { pagination } : {}),
      data,
      ...(extraParams.includeMetadata && {
        metadata: {
          timestamp: new Date().toISOString(),
          model: Model.modelName,
          version: '1.0'
        }
      })
    });

  } catch (error) {
    console.error("❌ fetchDataHelper Error:", error);
    
    if (options.returnType === 'object') {
      throw error;
    }
    
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      ...(options.includeErrorDetails && { stack: error.stack })
    });
  }
};

/* ------------------------------------------------------------
 * 🎯 USAGE EXAMPLES WITH ENHANCED EXPORTS
 * ------------------------------------------------------------ */

/*
// Example 1: Advanced CSV Export with custom formatting
await fetchDataHelper(req, res, UserModel, {
  extraParams: {
    asFile: true,
    fileType: 'csv',
    fields: ['name', 'email', 'createdAt', 'salary'],
    fieldLabels: {
      name: 'Full Name',
      email: 'Email Address',
      createdAt: 'Join Date',
      salary: 'Annual Salary'
    },
    fieldFormatters: {
      createdAt: { type: 'date', options: 'DD/MM/YYYY' },
      salary: { type: 'currency', options: 'USD' }
    },
    includeMetadata: true
  }
});

// Example 2: Multi-format ZIP Export
await fetchDataHelper(req, res, ProductModel, {
  extraParams: {
    asFile: true,
    fileType: 'zip',
    fileName: 'products_complete_export'
  }
});

// Example 3: PDF Report
await fetchDataHelper(req, res, OrderModel, {
  extraParams: {
    asFile: true,
    fileType: 'pdf',
    fields: ['orderId', 'customerName', 'total', 'status'],
    fieldLabels: {
      orderId: 'Order ID',
      customerName: 'Customer',
      total: 'Total Amount',
      status: 'Order Status'
    }
  }
});

// Example 4: XML Data Feed
await fetchDataHelper(req, res, InventoryModel, {
  extraParams: {
    asFile: true,
    fileType: 'xml',
    includeMetadata: true
  }
});
*/

export default fetchDataHelper;
export { fetchData, exportHandler, prepareExportData, exportFormatters };