import "dotenv/config"
import { buildCli } from "./cli/index.js"

buildCli().parse(process.argv)
