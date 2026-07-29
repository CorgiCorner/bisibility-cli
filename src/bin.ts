#!/usr/bin/env node
import { executeCli } from "./executable.js";

process.exitCode = await executeCli(process.argv.slice(2));
