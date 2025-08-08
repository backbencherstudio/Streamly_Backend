import YAML from "yamljs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const users = YAML.load(path.join(__dirname, "users.yml"));


export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Streamly API Docs",
    version: "1.0.0",
  },
  servers: [{ url: "http://localhost:4005" }],
  paths: {
    ...users.paths,
  }, 
};
