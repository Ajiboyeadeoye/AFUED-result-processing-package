import mongoose from "mongoose";
import { Parser as Json2CsvParser } from "json2csv";
import XLSX from "xlsx";
import PDFDocument from 'pdfkit';
import archiver from 'archiver';

const ENABLE_PERFORMANCE_LOG = false
const DEBUG = true;
const originalConsoleLog = console.log;

console.log = DEBUG ? originalConsoleLog : () => { };
// Add this helper function at the top
const logWithTime = (message, startTime = null) => {
  if (ENABLE_PERFORMANCE_LOG) {
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

const getPathFromFieldDef = (fieldDef) => {
  if (typeof fieldDef === 'string') return fieldDef;
  if (fieldDef && typeof fieldDef === 'object' && fieldDef.path) {
    console.log("Returning path from fieldDef", fieldDef.path)
    return fieldDef.path
  };
  return '';
};

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}



/**
 * buildNestedPopulate(Model, nestedPaths)
 * - nestedPaths: array of strings like "student._id" or "user.student.department"
 * - returns an array of mongoose-populate-objects to use with .populate(...)
 *
 * NOTE: it tries to read the schema refs and builds nested populate objects.
 */
const buildNestedPopulate = (Model, nestedPaths = []) => {
  if (!nestedPaths || !nestedPaths.length) return [];

  const rootPopulate = {};

  for (const fullPath of nestedPaths) {
    const parts = String(fullPath).split(".");
    let current = rootPopulate;
    let currentModel = Model;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      // guard
      if (!currentModel || !currentModel.schema) break;

      const schemaPath = currentModel.schema.path(part);
      if (!schemaPath) break;

      // ensure current has populate array
      if (!current.populate) current.populate = [];

      // find existing entry (avoid duplicates)
      let existing = current.populate.find((p) => p.path === part);
      if (!existing) {
        existing = { path: part };
        current.populate.push(existing);
      }

      // if this part references another model, step into it
      const refModelName = schemaPath.options?.ref;
      if (refModelName) {
        // attach the model (mongoose accepts model or modelName)
        const refModel = mongoose.models[refModelName];
        if (refModel) existing.model = refModelName; // safer to set name
        // continue with referenced model for deeper parts
        currentModel = mongoose.models[refModelName] || currentModel;
        // now move current pointer into this existing populate object
        current = existing;
      } else {
        // Not a ref — stop deeper resolution
        break;
      }
    }
  }

  return rootPopulate.populate || [];
};



/* ------------------------------------------------------------
 * 🧠 QUERY BUILDER (with support for custom_fields)
 * ------------------------------------------------------------ */
const queryBuilder = (payload = {}, options = {}) => {
  const {
    page = 1,
    fields = [],
    search_term = "",
    filter = {},
    sort = { createdAt: -1 },
    extraParams = {},
  } = payload;
  let limit = payload.limit;
  console.log(page);

  const enablePagination =
    options.enablePagination === undefined ? true : options.enablePagination;
  const additionalFilters = options.additionalFilters || {};
  const customFields = options.custom_fields || {};
  const defaultSort = options.sort || { createdAt: -1 };

  const currentPage = parseInt(page) || 1;
  const maxLimit = options.maxLimit || 100;
  limit = options.limit || limit;
  const itemsPerPage = Math.min(Math.max(parseInt(limit) || 20, 1), maxLimit);
  const skip = (currentPage - 1) * itemsPerPage;

  let query = { ...filter, ...additionalFilters };

  // Helper function to get path from field definition
  const getPathFromFieldDef = (fieldDef) => {
    if (typeof fieldDef === 'string') return fieldDef;
    if (fieldDef && typeof fieldDef === 'object' && fieldDef.path) return fieldDef.path;
    return '';
  };

  // if (fields.length && search_term) {
  //   const fieldArray = Array.isArray(fields) ? fields : String(fields).split(",");
  //   const regex = { $regex: search_term, $options: "i" };
  //   const orArray = [];

  //   for (const field of fieldArray) {
  //     const trimmed = field.trim();

  //     console.log("Processing field:", trimmed, customFields);

  //     if (customFields[trimmed]) {
  //       const fieldDef = customFields[trimmed];
  //       const path = getPathFromFieldDef(fieldDef);

  //       // If it has a dot in it push it directly
  //       if (path && path.includes('.')) {
  //         orArray.push({ [path]: regex });
  //         // Continue to next field - push the fallback if it is defined
  //         if (typeof fieldDef === 'object' && fieldDef.fallback) {
  //           console.log("Pushing fallback for custom field:", fieldDef.fallback);
  //           orArray.push({ [fieldDef.fallback]: regex });
  //         }
  //         // since this is a custom field that should replace the original
  //         continue;
  //       }

  //       // If it's a simple reference without dot, create nested path
  //       if (path) {
  //         console.log("Pushing nested path for custom field:", path);
  //         const nestedField = `${path}.${trimmed}`;
  //         orArray.push({ [nestedField]: regex });
  //         // Also add top-level fallback for backward compatibility
  //         orArray.push({ [trimmed]: regex });
  //       }
  //     } else {
  //       // Always push the top-level fallback for non-custom fields
  //       // orArray.push({ [trimmed]: regex });
  //     }
  //   }

  //   console.log(JSON.stringify(orArray, null, 2));

  //   // Remove duplicates if any
  //   const uniqueOrArray = [];
  //   const seenKeys = new Set();

  //   for (const condition of orArray) {
  //     const key = Object.keys(condition)[0];
  //     if (!seenKeys.has(key)) {
  //       seenKeys.add(key);
  //       uniqueOrArray.push(condition);
  //     }
  //   }

  //   query.$or = uniqueOrArray;
  // } 
  if (fields.length && search_term) {
    const fieldArray = Array.isArray(fields) ? fields : String(fields).split(",");
    const regex = { $regex: search_term, $options: "i" };
    const orArray = [];

    for (const field of fieldArray) {
      const trimmed = field.trim();
      const fieldDef = customFields[trimmed];

      // CASE 1: custom field exists
      if (fieldDef) {
        const path =
          typeof fieldDef === "string"
            ? fieldDef
            : fieldDef.path || "";

        // nested custom field (user.name)
        if (path.includes(".")) {
          orArray.push({ [path]: regex });

          // fallback
          if (typeof fieldDef === "object" && fieldDef.fallback) {
            orArray.push({ [fieldDef.fallback]: regex });
          }

          continue;
        }

        // simple custom ref (user)
        if (path) {
          orArray.push({ [`${path}.${trimmed}`]: regex });
          orArray.push({ [trimmed]: regex }); // fallback
          continue;
        }
      }

      // CASE 2: normal field, not custom
      orArray.push({ [trimmed]: regex });
    }

    // remove duplicate OR conditions
    const seen = new Set();
    query.$or = orArray.filter(cond => {
      const key = Object.keys(cond)[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  // Build query from payload
  const {
    query,
    finalSort,
    skip,
    itemsPerPage,
    enablePagination,
    extraParams,
    currentPage,
  } = queryBuilder(payload, options);

  // Determine if we need aggregation pipeline
  // const needsAggregation = shouldUseAggregationPipeline(query, options);
  const needsAggregation = !options.forceFind && shouldUseAggregationPipeline(query, options);


  let dataQuery;
  let queryBuildTime;

  if (needsAggregation) {
    queryBuildTime = logWithTime(`🔄 Building aggregation pipeline`);
    dataQuery = await executeAggregationPipeline(Model, query, finalSort, options, {
      skip,
      itemsPerPage,
      enablePagination,
      extraParams
    });
    logWithTime(`✅ Pipeline built`, queryBuildTime);
  } else {
    queryBuildTime = logWithTime(`🔧 Building find query`);
    dataQuery = await executeFindQuery(Model, query, finalSort, options, {
      skip,
      itemsPerPage,
      enablePagination,
      extraParams
    });
    logWithTime(`✅ Find query built`, queryBuildTime);
  }

  // Execute query
  const queryStart = logWithTime(`📡 Executing database query`);
  let data;
  try {
    data = await executeDatabaseQuery(dataQuery);
    logWithTime(`✅ Database query completed`, queryStart);
  } catch (error) {
    logWithTime(`❌ Database query failed`, queryStart);
    throw error;
  }

  // Post-processing
  data = await postProcessData(data, options, extraParams);

  // Pagination info
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
  if (ENABLE_PERFORMANCE_LOG) {
    logPerformanceSummary(Model.modelName, totalTime, data?.length || 0, enablePagination, needsAggregation, currentPage, itemsPerPage);
  }

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
        usedAggregation: needsAggregation
      }
    }
  };
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Determines whether to use aggregation pipeline or find query
 */
function shouldUseAggregationPipeline(query, options) {
  const { custom_fields = {}, additionalFilters = {} } = options;

  // Check if we have any custom fields
  const hasCustomFields = Object.keys(custom_fields).length > 0;
  if (!hasCustomFields) return false;

  // Check for nested filters in query or additionalFilters
  const hasNestedInQuery = hasNestedFilters(query, custom_fields);
  const hasNestedInAdditional = hasNestedFilters(additionalFilters, custom_fields);

  // Check if custom fields contain nested paths
  const hasNestedCustomFields = Object.values(custom_fields).some(fieldDef => {
    const path = getPathFromFieldDef(fieldDef);
    return path && path.includes('.');
  });

  // Check for $or conditions in query
  const hasOrConditions = query.$or && query.$or.length > 0;

  // Use aggregation if any nested conditions exist
  return hasNestedInQuery || hasNestedInAdditional || hasNestedCustomFields || hasOrConditions;
}

/**
 * Detect nested filters that should be deferred to post-lookup match
 */
function hasNestedFilters(filter, customFields = {}) {
  if (!filter || typeof filter !== 'object') return false;

  for (const key in filter) {
    if (!filter.hasOwnProperty(key)) continue;

    const value = filter[key];

    // Check for $or or $and operators
    if (key === '$or' || key === '$and') {
      if (Array.isArray(value)) {
        for (const cond of value) {
          if (cond && typeof cond === 'object' && hasNestedFilters(cond, customFields)) {
            return true;
          }
        }
      }
      return true; // $or and $and always go to post-lookup
    }

    // Check for nested paths
    if (key.includes('.')) {
      return true;
    }

    // Check if field is in custom_fields (deferred match)
    if (customFields && customFields[key]) {
      return true;
    }

    // Recursively check nested objects
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof RegExp)) {
      if (hasNestedFilters(value, customFields)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract root references from custom fields
 */
function extractRootRefs(customFields) {
  const rootRefs = new Set();

  Object.values(customFields || {}).forEach(fieldDef => {
    const path = getPathFromFieldDef(fieldDef);
    if (!path) return;

    const parts = path.split('.');
    if (parts.length === 1) {
      rootRefs.add(path);
    } else {
      rootRefs.add(parts[0]);
    }
  });

  return Array.from(rootRefs);
}

/**
 * Extract nested references from custom fields
 */
function extractNestedRefs(customFields) {
  const nestedRefs = new Set();

  Object.values(customFields || {}).forEach(fieldDef => {
    const path = getPathFromFieldDef(fieldDef);
    if (path && path.includes('.') && path.split('.').length > 1) {
      nestedRefs.add(path);
    }
  });

  return Array.from(nestedRefs);
}

/**
 * Get path from field definition
 */
// function getPathFromFieldDef(fieldDef) {
//   if (!fieldDef) return '';
//   if (typeof fieldDef === 'string') return fieldDef;
//   return fieldDef.path || '';
// }

/**
 * Split filters into root match and deferred match
 */
function splitFiltersIntoRootAndDeferred(query, customFields = {}) {
  const rootMatch = { ...query };
  const deferredMatch = {};

  // Remove $or/$and from root match (they always go to deferred)
  delete rootMatch.$or;
  delete rootMatch.$and;

  // Identify fields that should be deferred
  for (const key in rootMatch) {
    if (!rootMatch.hasOwnProperty(key)) continue;

    const shouldDefer = key.includes('.') || (customFields && customFields[key]);

    if (shouldDefer) {
      deferredMatch[key] = rootMatch[key];
      delete rootMatch[key];
    }
  }

  // Add $or/$and back to deferred match if they exist
  if (query.$or) deferredMatch.$or = query.$or;
  if (query.$and) deferredMatch.$and = query.$and;

  return { rootMatch, deferredMatch };
}

/**
 * Build lookup stages for references
 */
function buildLookups(Model, rootRefs, nestedRefs) {
  const lookups = [];
  const processedRefs = new Set();

  // Get actual collection names from models
  const getCollectionName = (modelName) => {
    try {
      const model = mongoose.model(modelName);
      return model.collection.name;  // Get actual MongoDB collection name
    } catch (err) {
      // Fallback to pluralized lowercase
      return modelName.toLowerCase() + 's';
    }
  };

  // Process root references (like "student", "semester")
  for (const ref of rootRefs) {
    if (processedRefs.has(ref)) continue;

    // Get schema information
    const schema = Model.schema;
    const schemaPath = schema.path(ref);

    if (!schemaPath || !schemaPath.options || !schemaPath.options.ref) {
      console.warn(`Field "${ref}" is not a reference in ${Model.modelName}`);
      continue;
    }

    const refModel = schemaPath.options.ref;
    const collectionName = getCollectionName(refModel);

    lookups.push({
      $lookup: {
        from: collectionName,
        localField: ref,
        foreignField: "_id",
        as: ref,
      }
    });

    lookups.push({
      $unwind: { path: `$${ref}`, preserveNullAndEmptyArrays: true }
    });

    processedRefs.add(ref);
  }

  // Process nested references (like "student._id")
  for (const nestedPath of nestedRefs) {
    const parts = nestedPath.split('.');
    if (parts.length < 2) continue;

    const [rootRef, nestedRef] = parts;

    // First, ensure the root document is populated
    if (!processedRefs.has(rootRef)) {
      // Check if rootRef is a reference in the main model
      const schema = Model.schema;
      const rootSchemaPath = schema.path(rootRef);

      if (rootSchemaPath && rootSchemaPath.options && rootSchemaPath.options.ref) {
        const refModel = rootSchemaPath.options.ref;
        const collectionName = getCollectionName(refModel);

        lookups.push({
          $lookup: {
            from: collectionName,
            localField: rootRef,
            foreignField: "_id",
            as: rootRef,
          }
        });

        lookups.push({
          $unwind: { path: `$${rootRef}`, preserveNullAndEmptyArrays: true }
        });

        processedRefs.add(rootRef);
      } else {
        console.warn(`Root reference "${rootRef}" not found in schema`);
        continue;
      }
    }

    // Now handle the nested reference
    // Get the referenced model for rootRef
    const rootSchemaPath = Model.schema.path(rootRef);
    if (!rootSchemaPath || !rootSchemaPath.options || !rootSchemaPath.options.ref) {
      console.warn(`Cannot find model for "${rootRef}"`);
      continue;
    }

    const rootModelName = rootSchemaPath.options.ref;

    try {
      const RootModel = mongoose.model(rootModelName);
      const nestedSchemaPath = RootModel.schema.path(nestedRef);

      if (!nestedSchemaPath || !nestedSchemaPath.options || !nestedSchemaPath.options.ref) {
        console.warn(`"${nestedRef}" is not a reference in ${rootModelName}`);
        continue;
      }

      const nestedRefModel = nestedSchemaPath.options.ref;
      const nestedCollectionName = getCollectionName(nestedRefModel);

      const asField = `${rootRef}_${nestedRef}`;

      lookups.push({
        $lookup: {
          from: nestedCollectionName,
          localField: `${rootRef}.${nestedRef}`,
          foreignField: "_id",
          as: asField,
        }
      });

      lookups.push({
        $unwind: { path: `$${asField}`, preserveNullAndEmptyArrays: true }
      });

    } catch (err) {
      console.error(`Error processing nested path "${nestedPath}":`, err.message);
    }
  }

  return lookups;
}
/**
 * Resolve reference model and local field
 */
// function resolveReference(Model, ref) {
//   let refPath = Model.schema.path(ref);
//   let refModel = refPath?.options?.ref;
//   let localField = ref;

//   // Handle shared _id references
//   if (!refModel && ref === "_id") {
//     const idPath = Model.schema.path("_id");
//     if (idPath?.options?.ref) {
//       return {
//         refModel: idPath.options.ref,
//         localField: "_id"
//       };
//     }
//   }

//   // Try alternative field patterns
//   if (!refModel) {
//     const altPaths = [`${ref}Id`, `${ref}_id`];
//     for (const alt of altPaths) {
//       const altPath = Model.schema.path(alt);
//       if (altPath?.options?.ref) {
//         refModel = altPath.options.ref;
//         localField = alt;
//         break;
//       }
//     }
//   }

//   return { refModel, localField };
// }
function resolveReference(Model, ref) {
  let refPath = Model.schema.path(ref);
  let refModel = refPath?.options?.ref;
  let localField = ref;

  // Handle shared _id references
  if (!refModel && ref === "_id") {
    const idPath = Model.schema.path("_id");
    if (idPath?.options?.ref) {
      return {
        refModel: idPath.options.ref,
        localField: "_id"
      };
    }
  }

  // Try alternative field patterns
  if (!refModel) {
    const altPaths = [`${ref}Id`, `${ref}_id`, `${ref}`];
    for (const alt of altPaths) {
      const altPath = Model.schema.path(alt);
      if (altPath?.options?.ref) {
        refModel = altPath.options.ref;
        localField = alt;
        break;
      }
    }
  }

  return { refModel, localField };
}

/**
 * Get nested model name for lookup
 */
function getNestedModelName(Model, rootRef, nestedRef) {
  // Try to get from schema first
  const rootPath = Model.schema.path(rootRef);
  if (rootPath?.options?.ref) {
    const rootModel = mongoose.model(rootPath.options.ref);
    const nestedPath = rootModel.schema.path(nestedRef);
    if (nestedPath?.options?.ref) {
      return nestedPath.options.ref;
    }
  }

  // Fallback to capitalized version
  return capitalize(nestedRef);
}

/**
 * Build post-lookup match stage
 */
function buildPostLookupMatch(deferredMatch, customFields) {
  if (!deferredMatch || Object.keys(deferredMatch).length === 0) {
    return null;
  }

  const matchStage = { ...deferredMatch };

  // Transform custom field paths in deferred match
  for (const key in matchStage) {
    if (!matchStage.hasOwnProperty(key)) continue;

    if (customFields && customFields[key]) {
      const path = getPathFromFieldDef(customFields[key]);
      if (path) {
        matchStage[path] = matchStage[key];
        delete matchStage[key];
      }
    }
  }

  return { $match: matchStage };
}

/**
 * Build the complete aggregation pipeline
 */
function buildAggregationPipeline(Model, query, sort, customFields, pagination) {
  const pipeline = [];

  // Phase 1: Pre-lookup match
  const { rootMatch, deferredMatch } = splitFiltersIntoRootAndDeferred(query, customFields);
  if (Object.keys(rootMatch).length > 0) {
    pipeline.push({ $match: rootMatch });
  }

  // Phase 2: Lookups
  const rootRefs = extractRootRefs(customFields);
  const nestedRefs = extractNestedRefs(customFields);
  const lookups = buildLookups(Model, rootRefs, nestedRefs);
  pipeline.push(...lookups);

  // Phase 3: Post-lookup match
  const postMatch = buildPostLookupMatch(deferredMatch, customFields);
  if (postMatch) {
    pipeline.push(postMatch);
  }

  // Phase 4: Sorting
  pipeline.push({ $sort: sort });

  // Phase 5: Pagination
  if (pagination.enablePagination && !pagination.extraParams.asFile) {
    pipeline.push({ $skip: pagination.skip });
    pipeline.push({ $limit: pagination.itemsPerPage });
  }

  return pipeline;
}

/**
 * Execute aggregation pipeline
 */
async function executeAggregationPipeline(Model, query, sort, options, pagination) {
  const { custom_fields = {} } = options;

  const pipeline = buildAggregationPipeline(Model, query, sort, custom_fields, pagination);

  if (ENABLE_PERFORMANCE_LOG) {
    console.log('📊 Aggregation pipeline:', JSON.stringify(pipeline, null, 2));
  }
  console.log(JSON.stringify(pipeline, null, 2));
  return Model.aggregate(pipeline);
}

/**
 * Execute find query with populate
 */
async function executeFindQuery(Model, query, sort, options, pagination) {
  let dataQuery = Model.find(query).sort(sort);

  // Build populate configuration
  const populateConfig = buildPopulateConfig(Model, options);

  // Apply populate
  for (const p of populateConfig) {
    dataQuery = dataQuery.populate(p);
  }

  // Apply pagination
  if (pagination.enablePagination && !pagination.extraParams.asFile) {
    dataQuery = dataQuery.skip(pagination.skip).limit(pagination.itemsPerPage);
  }

  return dataQuery;
}

/**
 * Build populate configuration
 */
function buildPopulateConfig(Model, options) {
  const { populate = [], custom_fields = {}, autoPopulate = true } = options;

  // Get nested populate paths from custom fields
  const nestedPopulatePaths = [];
  Object.values(custom_fields).forEach(fieldDef => {
    const path = getPathFromFieldDef(fieldDef);
    if (path && path.includes('.')) {
      nestedPopulatePaths.push(path);
    }
  });

  const nestedPopulate = buildNestedPopulate(Model, nestedPopulatePaths);

  // Merge manual populate + nested populate
  const manualPopulate = [].concat(populate);
  const normalize = (p) => (typeof p === 'string' ? { path: p } : p || {});

  // Add auto-populated fields
  if (autoPopulate !== false) {
    const schemaPaths = Model.schema.paths;
    const declaredPaths = new Set(manualPopulate.map(p => normalize(p).path));

    for (const key in schemaPaths) {
      const path = schemaPaths[key];
      if (path.options?.ref && !declaredPaths.has(key)) {
        manualPopulate.push({ path: key, select: "name" });
        declaredPaths.add(key);
      }
    }
  }

  // Merge all populate configurations
  return mergePopulateConfigs(manualPopulate, nestedPopulate);
}

/**
 * Merge multiple populate configurations
 */
function mergePopulateConfigs(manualPopulate, nestedPopulate) {
  const map = new Map();

  // Add manual populate first (takes precedence)
  for (const m of manualPopulate) {
    const normalized = normalizePopulate(m);
    map.set(normalized.path, {
      ...normalized,
      populate: [].concat(normalized.populate || [])
    });
  }

  // Merge nested populate
  for (const nRaw of nestedPopulate || []) {
    const normalized = normalizePopulate(nRaw);

    if (!map.has(normalized.path)) {
      map.set(normalized.path, {
        ...normalized,
        populate: [].concat(normalized.populate || [])
      });
    } else {
      const existing = map.get(normalized.path);
      existing.populate = existing.populate || [];

      const nestedSubs = [].concat(normalized.populate || []);
      for (const sub of nestedSubs) {
        const subPath = normalizePopulate(sub).path;
        const exists = existing.populate.some(p => normalizePopulate(p).path === subPath);
        if (!exists) existing.populate.push(sub);
      }

      map.set(normalized.path, existing);
    }
  }

  return Array.from(map.values());
}

/**
 * Normalize populate object
 */
function normalizePopulate(populate) {
  if (!populate) return { path: '' };
  if (typeof populate === 'string') return { path: populate };
  return populate;
}

/**
 * Execute database query
 */
async function executeDatabaseQuery(dataQuery) {
  if (typeof dataQuery.lean === "function") {
    return await dataQuery.lean();
  }
  return await dataQuery;
}

/**
 * Post-process data after query
 */
async function postProcessData(data, options, extraParams) {
  if (!Array.isArray(data) || data.length === 0) return data;

  let processedData = [...data];

  // Flatten custom fields
  if (options.custom_fields) {
    processedData = flattenCustomFields(processedData, options.custom_fields);
  }

  // Apply transformations
  if (options.configMap) {
    processedData = await applyTransformations(processedData, options.configMap);
  }

  // Remove excluded fields
  if (Array.isArray(extraParams?.excludeFields)) {
    processedData = removeExcludedFields(processedData, extraParams.excludeFields);
  }

  return processedData;
}

/**
 * Flatten custom fields in data
 */
function flattenCustomFields(data, customFields) {
  return data.map(item => {
    const newItem = { ...item };

    for (const [field, fieldDef] of Object.entries(customFields)) {
      let value;

      if (typeof fieldDef === 'string') {
        value = getNestedValue(item, fieldDef);
      } else if (fieldDef && typeof fieldDef === 'object') {
        const path = fieldDef.path || '';
        if (path) {
          value = getNestedValue(item, path);
        }

        // Use fallback if value is undefined
        if (value === undefined && fieldDef.fallback) {
          value = item[fieldDef.fallback];
        }
      }

      if (value !== undefined) {
        newItem[field] = value;
      }
    }

    return newItem;
  });
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

/**
 * Remove excluded fields from data
 */
function removeExcludedFields(data, excludeFields) {
  return data.map(item => {
    const newItem = { ...item };
    excludeFields.forEach(field => delete newItem[field]);
    return newItem;
  });
}

/**
 * Log performance summary
 */
function logPerformanceSummary(modelName, totalTime, recordCount, paginationEnabled, usedAggregation, currentPage, pageSize) {
  console.log(`\n📈 PERFORMANCE SUMMARY for ${modelName}:`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Records returned: ${recordCount}`);
  console.log(`   Pagination enabled: ${paginationEnabled}`);
  console.log(`   Used aggregation: ${usedAggregation}`);
  console.log(`   Current page: ${currentPage}`);
  console.log(`   Page size: ${pageSize}\n`);
}



// Note: buildNestedPopulate and applyTransformations functions remain as-is
// from the original code as they were not provided for refactoring
/* ------------------------------------------------------------
 * 🚀 SUPERCHARGED UNIVERSAL HELPER
 * ------------------------------------------------------------ */
export const fetchDataHelper = async (req, res, Model, options = {}) => {
  try {

    // const payload = req.method === 'GET' ? req.query : req.body;
    const rawPayload =
      req.method === "GET"
        ? req.query
        : req.body;

    const payload = rawPayload || {};

    const { returnType = 'response', ...fetchOptions } = options;

    // Get the data using the core fetcher
    const result = await fetchData(payload, Model, fetchOptions);
    const { data, pagination } = result;

    // Enhanced export handling
    const extraParams = payload?.extraParams || {};
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

export default fetchDataHelper;
export { fetchData, exportHandler, prepareExportData, exportFormatters };