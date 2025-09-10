#!/usr/bin/env node

/**
 * ENTERPRISE DEPENDENCY GRAPH ANALYZER
 * 
 * Maps every file interconnection, import chain, and dependency relationship
 * across your entire Findawise Empire project architecture
 */

const fs = require('fs').promises;
const path = require('path');

class DependencyGraphAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.fileMap = new Map(); // filepath -> file info
    this.dependencyGraph = new Map(); // filepath -> [dependencies]
    this.reverseDependencyGraph = new Map(); // filepath -> [dependents]
    this.importChains = new Map(); // module -> chain of files that import it
    this.typeExports = new Map(); // filepath -> exported types
    this.typeImports = new Map(); // filepath -> imported types
    this.circularDependencies = [];
    this.orphanedFiles = [];
  }

  async analyzeProject() {
    console.log('🔍 Building comprehensive dependency graph...');
    
    // Phase 1: Scan all files and extract basic info
    await this.scanProjectFiles();
    
    // Phase 2: Build dependency relationships
    await this.buildDependencyGraph();
    
    // Phase 3: Analyze import chains
    await this.analyzeImportChains();
    
    // Phase 4: Map type relationships
    await this.mapTypeRelationships();
    
    // Phase 5: Detect circular dependencies
    await this.detectCircularDependencies();
    
    // Phase 6: Find orphaned files
    await this.findOrphanedFiles();
    
    console.log('✅ Dependency graph analysis complete');
    return this.generateReport();
  }

  async scanProjectFiles() {
    const scanDir = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.projectRoot, fullPath);
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (this.isSourceFile(entry.name)) {
            await this.analyzeFile(fullPath, relativePath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };
    
    await scanDir(this.projectRoot);
  }

  isSourceFile(filename) {
    return /\.(ts|tsx|js|jsx)$/.test(filename);
  }

  async analyzeFile(fullPath, relativePath) {
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const fileInfo = {
        path: relativePath,
        fullPath,
        content,
        size: content.length,
        lines: content.split('\n').length,
        imports: this.extractImports(content),
        exports: this.extractExports(content),
        typeExports: this.extractTypeExports(content),
        typeImports: this.extractTypeImports(content),
        functions: this.extractFunctions(content),
        classes: this.extractClasses(content),
        interfaces: this.extractInterfaces(content),
        lastModified: (await fs.stat(fullPath)).mtime
      };
      
      this.fileMap.set(relativePath, fileInfo);
    } catch (error) {
      console.warn(`Warning: Could not analyze ${relativePath}`);
    }
  }

  extractImports(content) {
    const imports = [];
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push({
        module: match[1],
        line: content.substring(0, match.index).split('\n').length,
        raw: match[0]
      });
    }
    
    return imports;
  }

  extractExports(content) {
    const exports = [];
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
    let match;
    
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push({
        name: match[1],
        line: content.substring(0, match.index).split('\n').length,
        type: this.determineExportType(match[0])
      });
    }
    
    return exports;
  }

  extractTypeExports(content) {
    const types = [];
    const typeRegex = /export\s+(?:interface|type)\s+(\w+)/g;
    let match;
    
    while ((match = typeRegex.exec(content)) !== null) {
      types.push({
        name: match[1],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return types;
  }

  extractTypeImports(content) {
    const types = [];
    const typeImportRegex = /import\s+(?:type\s+)?(?:\{([^}]*)\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = typeImportRegex.exec(content)) !== null) {
      if (match[1]) {
        // Named imports
        const namedImports = match[1].split(',').map(imp => imp.trim()).filter(imp => imp);
        types.push({
          imports: namedImports,
          from: match[2],
          line: content.substring(0, match.index).split('\n').length
        });
      }
    }
    
    return types;
  }

  extractFunctions(content) {
    const functions = [];
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    const arrowFuncRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    
    let match;
    
    while ((match = funcRegex.exec(content)) !== null) {
      functions.push({
        name: match[1],
        type: 'function',
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    while ((match = arrowFuncRegex.exec(content)) !== null) {
      functions.push({
        name: match[1],
        type: 'arrow',
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return functions;
  }

  extractClasses(content) {
    const classes = [];
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    let match;
    
    while ((match = classRegex.exec(content)) !== null) {
      classes.push({
        name: match[1],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return classes;
  }

  extractInterfaces(content) {
    const interfaces = [];
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
    let match;
    
    while ((match = interfaceRegex.exec(content)) !== null) {
      interfaces.push({
        name: match[1],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return interfaces;
  }

  determineExportType(exportStatement) {
    if (exportStatement.includes('class')) return 'class';
    if (exportStatement.includes('function')) return 'function';
    if (exportStatement.includes('interface')) return 'interface';
    if (exportStatement.includes('type')) return 'type';
    return 'variable';
  }

  async buildDependencyGraph() {
    for (const [filePath, fileInfo] of this.fileMap) {
      const dependencies = [];
      
      for (const importInfo of fileInfo.imports) {
        const resolvedPath = this.resolveImportPath(filePath, importInfo.module);
        if (resolvedPath && this.fileMap.has(resolvedPath)) {
          dependencies.push({
            path: resolvedPath,
            module: importInfo.module,
            line: importInfo.line
          });
        }
      }
      
      this.dependencyGraph.set(filePath, dependencies);
      
      // Build reverse dependencies
      for (const dep of dependencies) {
        if (!this.reverseDependencyGraph.has(dep.path)) {
          this.reverseDependencyGraph.set(dep.path, []);
        }
        this.reverseDependencyGraph.get(dep.path).push({
          path: filePath,
          line: dep.line
        });
      }
    }
  }

  resolveImportPath(fromFile, importPath) {
    // Handle relative imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const fromDir = path.dirname(fromFile);
      const resolved = path.normalize(path.join(fromDir, importPath));
      
      // Try different extensions
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
      
      for (const ext of extensions) {
        const candidate = resolved + ext;
        if (this.fileMap.has(candidate)) {
          return candidate;
        }
      }
    }
    
    // Handle absolute imports (would need tsconfig.json path mapping)
    // For now, return null for node_modules or unresolved imports
    return null;
  }

  async analyzeImportChains() {
    for (const [filePath, dependencies] of this.dependencyGraph) {
      for (const dep of dependencies) {
        const chain = this.buildImportChain(dep.path, new Set());
        if (!this.importChains.has(dep.module)) {
          this.importChains.set(dep.module, []);
        }
        this.importChains.get(dep.module).push({
          from: filePath,
          to: dep.path,
          chain: Array.from(chain)
        });
      }
    }
  }

  buildImportChain(filePath, visited) {
    if (visited.has(filePath)) {
      return visited; // Circular dependency detected
    }
    
    const chain = new Set(visited);
    chain.add(filePath);
    
    const dependencies = this.dependencyGraph.get(filePath) || [];
    for (const dep of dependencies) {
      const subChain = this.buildImportChain(dep.path, chain);
      for (const item of subChain) {
        chain.add(item);
      }
    }
    
    return chain;
  }

  async mapTypeRelationships() {
    for (const [filePath, fileInfo] of this.fileMap) {
      // Map exported types
      if (fileInfo.typeExports.length > 0) {
        this.typeExports.set(filePath, fileInfo.typeExports);
      }
      
      // Map imported types
      if (fileInfo.typeImports.length > 0) {
        this.typeImports.set(filePath, fileInfo.typeImports);
      }
    }
  }

  async detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    
    for (const filePath of this.fileMap.keys()) {
      if (!visited.has(filePath)) {
        this.detectCircularDFS(filePath, visited, recursionStack, []);
      }
    }
  }

  detectCircularDFS(filePath, visited, recursionStack, path) {
    visited.add(filePath);
    recursionStack.add(filePath);
    path.push(filePath);
    
    const dependencies = this.dependencyGraph.get(filePath) || [];
    
    for (const dep of dependencies) {
      if (!visited.has(dep.path)) {
        this.detectCircularDFS(dep.path, visited, recursionStack, [...path]);
      } else if (recursionStack.has(dep.path)) {
        // Circular dependency found
        const cycleStart = path.indexOf(dep.path);
        const cycle = path.slice(cycleStart).concat([dep.path]);
        this.circularDependencies.push(cycle);
      }
    }
    
    recursionStack.delete(filePath);
  }

  async findOrphanedFiles() {
    for (const filePath of this.fileMap.keys()) {
      const dependents = this.reverseDependencyGraph.get(filePath) || [];
      const dependencies = this.dependencyGraph.get(filePath) || [];
      
      // File is orphaned if it has no dependents and is not an entry point
      if (dependents.length === 0 && !this.isEntryPoint(filePath)) {
        this.orphanedFiles.push(filePath);
      }
    }
  }

  isEntryPoint(filePath) {
    const filename = path.basename(filePath);
    const entryPatterns = [
      /^index\./,
      /^main\./,
      /^app\./,
      /\.test\./,
      /\.spec\./,
      /^server\./
    ];
    
    return entryPatterns.some(pattern => pattern.test(filename));
  }

  generateReport() {
    const totalFiles = this.fileMap.size;
    const totalDependencies = Array.from(this.dependencyGraph.values())
      .reduce((sum, deps) => sum + deps.length, 0);
    
    return {
      summary: {
        totalFiles,
        totalDependencies,
        circularDependencies: this.circularDependencies.length,
        orphanedFiles: this.orphanedFiles.length,
        averageDependenciesPerFile: totalFiles > 0 ? (totalDependencies / totalFiles).toFixed(2) : 0
      },
      fileMap: this.fileMap,
      dependencyGraph: this.dependencyGraph,
      reverseDependencyGraph: this.reverseDependencyGraph,
      importChains: this.importChains,
      typeExports: this.typeExports,
      typeImports: this.typeImports,
      circularDependencies: this.circularDependencies,
      orphanedFiles: this.orphanedFiles,
      
      // Analysis methods
      getFileDependents: (filePath) => this.reverseDependencyGraph.get(filePath) || [],
      getFileDependencies: (filePath) => this.dependencyGraph.get(filePath) || [],
      getImportChain: (module) => this.importChains.get(module) || [],
      getTypeExports: (filePath) => this.typeExports.get(filePath) || [],
      getTypeImports: (filePath) => this.typeImports.get(filePath) || [],
      
      // Impact analysis
      analyzeChangeImpact: (filePath) => this.analyzeChangeImpact(filePath),
      findTypeUsage: (typeName) => this.findTypeUsage(typeName),
      getModuleBoundaries: () => this.getModuleBoundaries()
    };
  }

  analyzeChangeImpact(filePath) {
    const directDependents = this.reverseDependencyGraph.get(filePath) || [];
    const allAffectedFiles = new Set();
    
    const traverse = (file) => {
      if (allAffectedFiles.has(file)) return;
      allAffectedFiles.add(file);
      
      const dependents = this.reverseDependencyGraph.get(file) || [];
      for (const dependent of dependents) {
        traverse(dependent.path);
      }
    };
    
    for (const dependent of directDependents) {
      traverse(dependent.path);
    }
    
    return {
      directlyAffected: directDependents.map(d => d.path),
      totalAffected: Array.from(allAffectedFiles),
      impactScore: allAffectedFiles.size
    };
  }

  findTypeUsage(typeName) {
    const usage = [];
    
    for (const [filePath, typeImports] of this.typeImports) {
      for (const importInfo of typeImports) {
        if (importInfo.imports.includes(typeName)) {
          usage.push({
            file: filePath,
            line: importInfo.line,
            from: importInfo.from
          });
        }
      }
    }
    
    return usage;
  }

  getModuleBoundaries() {
    const modules = new Map();
    
    for (const filePath of this.fileMap.keys()) {
      const parts = filePath.split('/');
      const moduleRoot = parts.length > 1 ? parts[0] : 'root';
      
      if (!modules.has(moduleRoot)) {
        modules.set(moduleRoot, {
          files: [],
          internalDependencies: 0,
          externalDependencies: 0
        });
      }
      
      const module = modules.get(moduleRoot);
      module.files.push(filePath);
      
      const dependencies = this.dependencyGraph.get(filePath) || [];
      for (const dep of dependencies) {
        const depParts = dep.path.split('/');
        const depModuleRoot = depParts.length > 1 ? depParts[0] : 'root';
        
        if (depModuleRoot === moduleRoot) {
          module.internalDependencies++;
        } else {
          module.externalDependencies++;
        }
      }
    }
    
    return modules;
  }
}

module.exports = DependencyGraphAnalyzer;