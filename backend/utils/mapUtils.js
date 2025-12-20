// utils/MapUtils.js

class MapUtils {
  /**
   * Convert Map to plain object
   */
  static mapToObject(map) {
    if (!map) return {};
    if (typeof map === 'object' && !(map instanceof Map)) return map;
    if (!(map instanceof Map)) return {};
    
    const obj = {};
    for (const [key, value] of map.entries()) {
      if (value instanceof Map) {
        obj[key] = this.mapToObject(value);
      } else if (Array.isArray(value)) {
        obj[key] = value.map(item => 
          item instanceof Map ? this.mapToObject(item) : item
        );
      } else {
        obj[key] = value;
      }
    }
    return obj;
  }

  /**
   * Convert object to Map
   */
  static objectToMap(obj) {
    if (!obj) return new Map();
    if (obj instanceof Map) return obj;
    if (typeof obj !== 'object') return new Map();
    
    const map = new Map();
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        map.set(key, this.objectToMap(value));
      } else if (Array.isArray(value)) {
        map.set(key, value.map(item => 
          item && typeof item === 'object' ? this.objectToMap(item) : item
        ));
      } else {
        map.set(key, value);
      }
    }
    return map;
  }

  /**
   * Safely get value from Map or object
   */
  static getValue(source, key, defaultValue = null) {
    if (!source) return defaultValue;
    
    if (source instanceof Map) {
      return source.has(key) ? source.get(key) : defaultValue;
    }
    
    if (typeof source === 'object') {
      return source[key] !== undefined ? source[key] : defaultValue;
    }
    
    return defaultValue;
  }

  /**
   * Check if value is Map
   */
  static isMap(value) {
    return value instanceof Map;
  }

  /**
   * Deep merge Map or object
   */
  static merge(target, source) {
    const targetObj = this.isMap(target) ? this.mapToObject(target) : target;
    const sourceObj = this.isMap(source) ? this.mapToObject(source) : source;
    
    const result = { ...targetObj };
    
    for (const [key, value] of Object.entries(sourceObj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.merge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return this.isMap(target) ? this.objectToMap(result) : result;
  }
}

export default MapUtils;