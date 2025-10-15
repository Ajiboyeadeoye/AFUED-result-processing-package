// backend/utils/universalQueryHandler.js
/**
 * 🧠 Universal Query Handler for Express + Mongoose
 * --------------------------------------------------
 * Handles:
 *  - Advanced filter queries from frontend
 *  - Simple field search
 *  - Pagination (with defaults)
 *  - Works with ANY Mongoose model
 */

export const universalQueryHandler = async (
  model,
  body = {},
  defaultLimit = 20,
  defaultPage = 1
) => {
  try {
    const {
      fields = [],
      search_term = "",
      filter = null,
      limit,
      page,
    } = body;

    // ⚙️ Pagination setup
    const currentPage = page && page > 0 ? Number(page) : defaultPage;
    const perPage = limit && limit > 0 ? Number(limit) : defaultLimit;

    // 🧩 Build query
    let query = {};

    if (filter && typeof filter === "object" && Object.keys(filter).length > 0) {
      // Advanced filter mode (from AdvancedFilterSystem)
      query = filter;
    } else if (Array.isArray(fields) && search_term.trim() !== "") {
      // Normal search mode
      query = {
        $or: fields.map((f) => ({
          [f]: { $regex: search_term, $options: "i" },
        })),
      };
    }

    // 🧮 Handle pagination — advanced filters shouldn't auto-paginate
    const skip = filter ? 0 : (currentPage - 1) * perPage;
    const useLimit = filter ? limit ?? 0 : perPage;

    // 🧾 Fetch results
    const results = await model.find(query).skip(skip).limit(useLimit).lean();
    const totalItems = await model.countDocuments(query);
    const totalPages = useLimit > 0 ? Math.ceil(totalItems / useLimit) : 1;

    return {
      success: true,
      message: "Data fetched successfully",
      data: results,
      pagination: {
        current_page: currentPage,
        limit: useLimit,
        total_pages: totalPages,
        total_items: totalItems,
      },
      query_used: query,
    };
  } catch (error) {
    console.error("❌ universalQueryHandler Error:", error);
    return {
      success: false,
      message: error.message || "Something went wrong while fetching data",
    };
  }
};
