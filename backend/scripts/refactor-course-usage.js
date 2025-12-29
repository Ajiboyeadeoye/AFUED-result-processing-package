import fs from "fs";
import path from "path";

const ROOT = "./backend";
const TARGET_IMPORT = /import\s+Course\s+from\s+["'].*course\.model\.js["'];?/;
const SERVICE_IMPORT = `import CourseService from "../course/course.service.js";\n`;

function walk(dir) {
  return fs.readdirSync(dir).flatMap(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) return walk(fullPath);
    if (file.endsWith(".js")) return [fullPath];
    return [];
  });
}

const files = walk(ROOT);

files.forEach(file => {
  let content = fs.readFileSync(file, "utf8");
  let modified = false;

  // Comment out direct model import
  if (TARGET_IMPORT.test(content)) {
    content = content.replace(
      TARGET_IMPORT,
      match => `// ⚠️ REFACTORED: direct model access removed\n// ${match}\n${SERVICE_IMPORT}`
    );
    modified = true;
  }

  // Replace common usages
  const replacements = [
    ["Course.findById(", "CourseService.findById("],
    ["Course.find({", "CourseService.findByIds("],
    ["Course.findOne(", "CourseService.findById("],
    ["Course.exists(", "CourseService.existsByCourseCode("],
  ];

  replacements.forEach(([oldVal, newVal]) => {
    if (content.includes(oldVal)) {
      content = content.replaceAll(oldVal, newVal);
      modified = true;
    }
  });

  if (modified) {
    const warning = `
/* ⚠️ WARNING
 * This file was auto-modified to replace direct Course model usage
 * Please verify logic correctness manually.
 */
console.warn("[ARCH-REFORM] Direct Course model usage replaced with CourseService in ${path.basename(file)}");
`;

    content = warning + content;
    fs.writeFileSync(file, content, "utf8");
    console.log("✔ Refactored:", file);
  }
});
