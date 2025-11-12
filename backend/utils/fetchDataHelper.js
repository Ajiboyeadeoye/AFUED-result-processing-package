import mongoose from "mongoose";
import { Parser as Json2CsvParser } from "json2csv";
import XLSX from "xlsx";

/* ------------------------------------------------------------
 * 🧠 QUERY BUILDER (with support for custom_fields)
 * ------------------------------------------------------------ */
const queryBuilder = (payload = {}, options = {}) => {
  // Destructure payload with defaults
  const {
    page = 1,
    limit = 20,
    fields = [],
    search_term = "",
    filter = {},
    sort = { createdAt: -1 },
    extraParams = {},
  } = payload;

  // Safe options values
  const enablePagination =
    options.enablePagination === undefined ? true : options.enablePagination;
  const additionalFilters = options.additionalFilters || {};
  const customFields = options.custom_fields || {};
  const defaultSort = options.sort || { createdAt: -1 };

  const currentPage = parseInt(page) || 1;
    const maxLimit = options.maxLimit || 100; // <-- backend enforced max
  const itemsPerPage = Math.min(Math.max(parseInt(limit) || 20, 1), maxLimit);
  // const itemsPerPage = Math.max(parseInt(limit) || 20, 1);
  const skip = (currentPage - 1) * itemsPerPage;

  // Start building query
  let query = { ...filter, ...additionalFilters };

  // 🔍 Search across multiple fields
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
    // Handle OR fallback expressions like "this.user?.name || this.userId?.name"
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
      // Normal single path
      transformed[key] = resolvePath(doc, value.replace(/^this\./, "").replace(/\?/g, ""));
    }
  } catch {
    transformed[key] = null;
  }
}
 else if (value.includes(".")) {
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
 * 📁 EXPORT HANDLER
 * ------------------------------------------------------------ */
const exportHandler = (res, modelName, data, fileType) => {
  const filename = `${modelName}_export_${Date.now()}`;
  const lowerType = fileType?.toLowerCase() || "csv";

  if (lowerType === "csv") {
    const parser = new Json2CsvParser();
    const csv = parser.parse(data);
    res.header("Content-Type", "text/csv");
    res.attachment(`${filename}.csv`);
    return res.send(csv);
  }

  if (["excel", "xlsx"].includes(lowerType)) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.attachment(`${filename}.xlsx`);
    return res.send(buffer);
  }

  if (lowerType === "json") {
    res.header("Content-Type", "application/json");
    res.attachment(`${filename}.json`);
    return res.send(JSON.stringify(data, null, 2));
  }

  return res.status(400).json({ message: "Invalid file type" });
};

/* ------------------------------------------------------------
 * ⚡ MAIN UNIVERSAL FETCH & EXPORT HELPER (with custom_fields support)
 * ------------------------------------------------------------ */
export const fetchDataHelper = async (req, res, Model, options = {}) => {
  try {
    const payload = req.method === "GET" ? req.query : req.body;
    const {
      query,
      finalSort,
      skip,
      itemsPerPage,
      enablePagination,
      extraParams,
      currentPage,
    } = queryBuilder(payload, options);

    // Detect if we’re searching inside referenced custom_fields
    const hasNestedSearch =
      options.custom_fields &&
      Object.keys(options.custom_fields).some((key) =>
        query.$or?.some?.((cond) =>
          Object.keys(cond)[0].startsWith(options.custom_fields[key] + ".")
        )
      );

    let dataQuery;

if (hasNestedSearch) {
  const pipeline = [];

  // ✅ Base match
  const baseMatch = { ...query };
  delete baseMatch.$or;
  if (Object.keys(baseMatch).length) pipeline.push({ $match: baseMatch });

  // ✅ Lookups for each ref in custom_fields
  for (const ref of new Set(Object.values(options.custom_fields))) {
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

    // 🪄 NEW: Handle cases where _id is used as the reference (shared IDs)
    if (!refModel && ref === "_id") {
      const idPath = Model.schema.path("_id");
      if (idPath?.options?.ref) {
        refModel = idPath.options.ref;
        localField = "_id";
      }
    }

    // If still no ref model, skip
    if (!refModel) continue;

    // ✅ Add lookup
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

  // ✅ Apply search condition
  if (query.$or?.length) pipeline.push({ $match: { $or: query.$or } });

  // ✅ Sorting and pagination
  pipeline.push({ $sort: finalSort });
  if (enablePagination && !extraParams.asFile) {
    pipeline.push({ $skip: skip }, { $limit: itemsPerPage });
  }

  dataQuery = Model.aggregate(pipeline);
}

 else {
      // 🧠 Default behavior (untouched)
      dataQuery = Model.find(query).sort(finalSort);

      // Custom populates
      if (options.populate)
        for (const pop of [].concat(options.populate))
          dataQuery = dataQuery.populate(pop);

      // Auto-populate refs
      if (options.autoPopulate !== false) {
        const schemaPaths = Model.schema.paths;
        const populated = new Set(
          options.populate?.map((p) => p.path || p) || []
        );
        for (const key in schemaPaths) {
          const path = schemaPaths[key];
          if (path.options?.ref && !populated.has(key))
            dataQuery = dataQuery.populate({ path: key, select: "name" });
        }
      }

      // Pagination
      if (enablePagination && !extraParams.asFile)
        dataQuery = dataQuery.skip(skip).limit(itemsPerPage);
    }

    // Execute query
    let data;

    if (typeof dataQuery.lean === "function") {
      // Normal find() query
      data = await dataQuery.lean();
    } else {
      // Aggregation pipeline result (aggregate() returns an array)
      data = await dataQuery;
    }

// 🪄 Flatten custom fields first
if (options.custom_fields && Array.isArray(data) && data.length) {
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
}

// 🧠 Apply transformations (like this.user.name)
data = await applyTransformations(data, options.configMap);

// 🧹 Finally remove excluded fields (AFTER flattening + transformation)
if (Array.isArray(extraParams.excludeFields)) {
  data = data.map((item) => {
    extraParams.excludeFields.forEach((f) => delete item[f]);
    return item;
  });
}


    // Export file if requested
    if (extraParams.asFile) {
      return exportHandler(res, Model.modelName, data, extraParams.fileType);
    }

    // Pagination info
    let pagination = null;
    if (enablePagination && !extraParams.asFile) {
      const totalItems = await Model.countDocuments(query);
      pagination = {
        current_page: currentPage,
        limit: itemsPerPage,
        total_pages: Math.ceil(totalItems / itemsPerPage),
        total_items: totalItems,
      };
    }

    // ✅ Response
    return res.status(200).json({
      message: `${Model.modelName} data fetched successfully`,
      ...(pagination ? { pagination } : {}),
      data,
    });
  } catch (error) {
    console.error("❌ fetchDataHelper Error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export default fetchDataHelper;
