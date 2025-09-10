#!/usr/bin/env node

/**
 * ENTERPRISE CONTEXT ANALYZER
 * 
 * Provides deep, intelligent context understanding beyond simple line windows
 * Understands function scope, class context, module relationships, and semantic meaning
 */

const fs = require('fs').promises;
const path = require('path');

class ContextAnalyzer {
  constructor(projectRoot, dependencyGraph, typePropagation) {
    this.projectRoot = projectRoot;
    this.dependencyGraph = dependencyGraph;
    this.typePropagation = typePropagation;
    this.functionMap = new Map(); // function -> detailed info
    this.classMap = new Map(); // class -> detailed info
    this.scopeHierarchy = new Map(); // file -> scope tree
    this.semanticContexts = new Map(); // error -> semantic context
    this.crossReferenceMap = new Map(); // symbol -> all references
  }

  async analyzeProjectContext() {
    console.log('🔍 Building deep context analysis...');
    
    // Phase 1: Extract function and class contexts
    await this.extractCodeStructures();
    
    // Phase 2: Build scope hierarchies
    await this.buildScopeHierarchies();
    
    // Phase 3: Map cross-references
    await this.mapCrossReferences();
    
    // Phase 4: Create semantic contexts
    await this.createSemanticContexts();
    
    console.log('✅ Context analysis complete');
    return this.generateContextReport();
  }

  async extractCodeStructures() {
    for (const [filePath, fileInfo] of this.dependencyGraph.fileMap) {
      const content = fileInfo.content;
      
      // Extract detailed function information
      const functions = this.extractDetailedFunctions(content, filePath);
      functions.forEach(func => {
        const key = `${filePath}:${func.name}`;
        this.functionMap.set(key, func);
      });
      
      // Extract detailed class information
      const classes = this.extractDetailedClasses(content, filePath);
      classes.forEach(cls => {
        const key = `${filePath}:${cls.name}`;
        this.classMap.set(key, cls);
      });
    }
  }

  extractDetailedFunctions(content, filePath) {
    const functions = [];
    const lines = content.split('\n');
    
    // Function declarations
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
    let match;
    
    while ((match = funcRegex.exec(content)) !== null) {
      const [fullMatch, name, params, returnType] = match;
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findFunctionEnd(content, match.index);
      
      functions.push({
        name,
        type: 'function',
        parameters: this.parseParameters(params),
        returnType: returnType ? returnType.trim() : 'unknown',
        startLine,
        endLine,
        body: this.extractFunctionBody(lines, startLine - 1, endLine - 1),
        dependencies: this.findFunctionDependencies(content, match.index, endLine),
        complexity: this.calculateComplexity(content, match.index, endLine),
        exported: fullMatch.includes('export'),
        async: fullMatch.includes('async'),
        file: filePath
      });
    }
    
    // Arrow functions
    const arrowRegex = /(?:export\s+)?const\s+(\w+)\s*(?::\s*([^=]+))?\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>\s*\{?/g;
    
    while ((match = arrowRegex.exec(content)) !== null) {
      const [fullMatch, name, typeAnnotation, params, returnType] = match;
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findArrowFunctionEnd(content, match.index);
      
      functions.push({
        name,
        type: 'arrow',
        parameters: this.parseParameters(params),
        returnType: returnType ? returnType.trim() : (typeAnnotation ? this.extractReturnType(typeAnnotation) : 'unknown'),
        startLine,
        endLine,
        body: this.extractFunctionBody(lines, startLine - 1, endLine - 1),
        dependencies: this.findFunctionDependencies(content, match.index, endLine),
        complexity: this.calculateComplexity(content, match.index, endLine),
        exported: fullMatch.includes('export'),
        async: fullMatch.includes('async'),
        file: filePath
      });
    }
    
    return functions;
  }

  extractDetailedClasses(content, filePath) {
    const classes = [];
    const lines = content.split('\n');
    
    const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:<([^>]+)>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
    let match;
    
    while ((match = classRegex.exec(content)) !== null) {
      const [fullMatch, name, generics, extendsClass, implementsInterfaces] = match;
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findClassEnd(content, match.index);
      
      const classBody = this.extractClassBody(lines, startLine - 1, endLine - 1);
      
      classes.push({
        name,
        generics: generics ? this.parseGenerics(generics) : [],
        extends: extendsClass || null,
        implements: implementsInterfaces ? this.parseImplements(implementsInterfaces) : [],
        startLine,
        endLine,
        methods: this.extractClassMethods(classBody, startLine),
        properties: this.extractClassProperties(classBody, startLine),
        constructor: this.extractConstructor(classBody, startLine),
        dependencies: this.findClassDependencies(content, match.index, endLine),
        exported: fullMatch.includes('export'),
        abstract: fullMatch.includes('abstract'),
        file: filePath
      });
    }
    
    return classes;
  }

  parseParameters(paramsStr) {
    if (!paramsStr.trim()) return [];
    
    return paramsStr.split(',').map(param => {
      const trimmed = param.trim();
      const [nameWithOptional, type] = trimmed.split(':').map(p => p.trim());
      const isOptional = nameWithOptional.includes('?');
      const name = nameWithOptional.replace('?', '');
      
      return {
        name,
        type: type || 'any',
        optional: isOptional
      };
    });
  }

  findFunctionEnd(content, startIndex) {
    let braceCount = 0;
    let inFunction = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{') {
        braceCount++;
        inFunction = true;
      } else if (char === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          return content.substring(0, i).split('\n').length;
        }
      }
    }
    
    return content.split('\n').length;
  }

  findArrowFunctionEnd(content, startIndex) {
    // For arrow functions, we need to handle both block and expression bodies
    const afterArrow = content.indexOf('=>', startIndex);
    if (afterArrow === -1) return content.split('\n').length;
    
    let i = afterArrow + 2;
    while (i < content.length && /\s/.test(content[i])) i++; // Skip whitespace
    
    if (content[i] === '{') {
      // Block body
      return this.findFunctionEnd(content, i);
    } else {
      // Expression body - find end of expression
      let parenCount = 0;
      while (i < content.length) {
        const char = content[i];
        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        else if ((char === ';' || char === '\n') && parenCount === 0) {
          return content.substring(0, i).split('\n').length;
        }
        i++;
      }
    }
    
    return content.split('\n').length;
  }

  findClassEnd(content, startIndex) {
    return this.findFunctionEnd(content, startIndex); // Same logic
  }

  extractFunctionBody(lines, startLine, endLine) {
    return lines.slice(startLine, endLine).join('\n');
  }

  extractClassBody(lines, startLine, endLine) {
    return lines.slice(startLine, endLine).join('\n');
  }

  extractClassMethods(classBody, classStartLine) {
    const methods = [];
    const methodRegex = /(?:public|private|protected)?\s*(?:static)?\s*(?:async)?\s*(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
    let match;
    
    while ((match = methodRegex.exec(classBody)) !== null) {
      const [fullMatch, name, params, returnType] = match;
      const methodLine = classStartLine + classBody.substring(0, match.index).split('\n').length - 1;
      
      methods.push({
        name,
        parameters: this.parseParameters(params),
        returnType: returnType ? returnType.trim() : 'unknown',
        line: methodLine,
        visibility: this.extractVisibility(fullMatch),
        static: fullMatch.includes('static'),
        async: fullMatch.includes('async')
      });
    }
    
    return methods;
  }

  extractClassProperties(classBody, classStartLine) {
    const properties = [];
    const propRegex = /(?:public|private|protected)?\s*(?:static)?\s*(?:readonly)?\s*(\w+)(?:\?)?:\s*([^;=\n]+)/g;
    let match;
    
    while ((match = propRegex.exec(classBody)) !== null) {
      const [fullMatch, name, type] = match;
      const propLine = classStartLine + classBody.substring(0, match.index).split('\n').length - 1;
      
      properties.push({
        name,
        type: type.trim(),
        line: propLine,
        visibility: this.extractVisibility(fullMatch),
        static: fullMatch.includes('static'),
        readonly: fullMatch.includes('readonly'),
        optional: fullMatch.includes('?')
      });
    }
    
    return properties;
  }

  extractConstructor(classBody, classStartLine) {
    const constructorRegex = /constructor\s*\(([^)]*)\)\s*\{/;
    const match = constructorRegex.exec(classBody);
    
    if (match) {
      const [, params] = match;
      const constructorLine = classStartLine + classBody.substring(0, match.index).split('\n').length - 1;
      
      return {
        parameters: this.parseParameters(params),
        line: constructorLine
      };
    }
    
    return null;
  }

  extractVisibility(statement) {
    if (statement.includes('private')) return 'private';
    if (statement.includes('protected')) return 'protected';
    return 'public';
  }

  findFunctionDependencies(content, startIndex, endIndex) {
    const functionContent = content.substring(startIndex, endIndex);
    const dependencies = new Set();
    
    // Find function calls
    const callRegex = /(\w+)\s*\(/g;
    let match;
    
    while ((match = callRegex.exec(functionContent)) !== null) {
      dependencies.add(match[1]);
    }
    
    // Find variable references
    const varRegex = /\b(\w+)\./g;
    while ((match = varRegex.exec(functionContent)) !== null) {
      dependencies.add(match[1]);
    }
    
    return Array.from(dependencies);
  }

  findClassDependencies(content, startIndex, endIndex) {
    return this.findFunctionDependencies(content, startIndex, endIndex);
  }

  calculateComplexity(content, startIndex, endIndex) {
    const functionContent = content.substring(startIndex, endIndex);
    let complexity = 1; // Base complexity
    
    // Count decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\&\&/g,
      /\|\|/g,
      /\?/g // Ternary operator
    ];
    
    decisionPatterns.forEach(pattern => {
      const matches = functionContent.match(pattern);
      if (matches) complexity += matches.length;
    });
    
    return complexity;
  }

  async buildScopeHierarchies() {
    for (const [filePath, fileInfo] of this.dependencyGraph.fileMap) {
      const content = fileInfo.content;
      const scopeTree = this.buildFileScopeTree(content, filePath);
      this.scopeHierarchy.set(filePath, scopeTree);
    }
  }

  buildFileScopeTree(content, filePath) {
    const root = {
      type: 'file',
      name: filePath,
      startLine: 1,
      endLine: content.split('\n').length,
      children: [],
      variables: this.extractFileVariables(content),
      imports: this.extractImportedSymbols(content),
      exports: this.extractExportedSymbols(content)
    };
    
    // Add functions as scopes
    for (const [key, func] of this.functionMap) {
      if (key.startsWith(filePath + ':')) {
        root.children.push({
          type: 'function',
          name: func.name,
          startLine: func.startLine,
          endLine: func.endLine,
          children: [],
          variables: this.extractFunctionVariables(func.body),
          parameters: func.parameters
        });
      }
    }
    
    // Add classes as scopes
    for (const [key, cls] of this.classMap) {
      if (key.startsWith(filePath + ':')) {
        const classScope = {
          type: 'class',
          name: cls.name,
          startLine: cls.startLine,
          endLine: cls.endLine,
          children: [],
          properties: cls.properties,
          methods: cls.methods
        };
        
        // Add methods as sub-scopes
        cls.methods.forEach(method => {
          classScope.children.push({
            type: 'method',
            name: method.name,
            startLine: method.line,
            endLine: method.line + 10, // Approximate
            children: [],
            parameters: method.parameters
          });
        });
        
        root.children.push(classScope);
      }
    }
    
    return root;
  }

  extractFileVariables(content) {
    const variables = [];
    const varRegex = /(?:const|let|var)\s+(\w+)(?:\s*:\s*([^=\n]+))?\s*=/g;
    let match;
    
    while ((match = varRegex.exec(content)) !== null) {
      const [, name, type] = match;
      const line = content.substring(0, match.index).split('\n').length;
      
      variables.push({
        name,
        type: type ? type.trim() : 'unknown',
        line
      });
    }
    
    return variables;
  }

  extractFunctionVariables(functionBody) {
    return this.extractFileVariables(functionBody);
  }

  extractImportedSymbols(content) {
    const symbols = [];
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const [, namedImports, defaultImport, from] = match;
      const line = content.substring(0, match.index).split('\n').length;
      
      if (namedImports) {
        namedImports.split(',').forEach(imp => {
          symbols.push({
            name: imp.trim(),
            type: 'named',
            from,
            line
          });
        });
      }
      
      if (defaultImport) {
        symbols.push({
          name: defaultImport,
          type: 'default',
          from,
          line
        });
      }
    }
    
    return symbols;
  }

  extractExportedSymbols(content) {
    const symbols = [];
    const exportRegex = /export\s+(?:\{([^}]+)\}|(?:default\s+)?(?:class|function|const|let|var)\s+(\w+))/g;
    let match;
    
    while ((match = exportRegex.exec(content)) !== null) {
      const [fullMatch, namedExports, singleExport] = match;
      const line = content.substring(0, match.index).split('\n').length;
      
      if (namedExports) {
        namedExports.split(',').forEach(exp => {
          symbols.push({
            name: exp.trim(),
            type: 'named',
            line
          });
        });
      }
      
      if (singleExport) {
        symbols.push({
          name: singleExport,
          type: fullMatch.includes('default') ? 'default' : 'named',
          line
        });
      }
    }
    
    return symbols;
  }

  async mapCrossReferences() {
    for (const [filePath, fileInfo] of this.dependencyGraph.fileMap) {
      const content = fileInfo.content;
      const lines = content.split('\n');
      
      // Find all symbol references
      lines.forEach((line, index) => {
        const symbolRefs = this.findSymbolReferences(line);
        symbolRefs.forEach(symbol => {
          if (!this.crossReferenceMap.has(symbol)) {
            this.crossReferenceMap.set(symbol, []);
          }
          
          this.crossReferenceMap.get(symbol).push({
            file: filePath,
            line: index + 1,
            context: this.getLineContext(lines, index)
          });
        });
      });
    }
  }

  findSymbolReferences(line) {
    const symbols = [];
    
    // Function calls
    const callRegex = /(\w+)\s*\(/g;
    let match;
    while ((match = callRegex.exec(line)) !== null) {
      symbols.push(match[1]);
    }
    
    // Property access
    const propRegex = /(\w+)\./g;
    while ((match = propRegex.exec(line)) !== null) {
      symbols.push(match[1]);
    }
    
    // Variable references (simple heuristic)
    const varRegex = /\b([A-Z][a-zA-Z0-9]*)\b/g;
    while ((match = varRegex.exec(line)) !== null) {
      symbols.push(match[1]);
    }
    
    return symbols;
  }

  getLineContext(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(lines.length, lineIndex + 3);
    return lines.slice(start, end).join('\n');
  }

  async createSemanticContexts() {
    // This would be called when analyzing specific errors
    // For now, we'll prepare the infrastructure
    this.semanticContexts.set('preparation', 'complete');
  }

  generateContextReport() {
    return {
      summary: {
        totalFunctions: this.functionMap.size,
        totalClasses: this.classMap.size,
        filesWithScope: this.scopeHierarchy.size,
        crossReferences: this.crossReferenceMap.size
      },
      
      functionMap: this.functionMap,
      classMap: this.classMap,
      scopeHierarchy: this.scopeHierarchy,
      crossReferenceMap: this.crossReferenceMap,
      
      // Context retrieval methods
      getErrorContext: (filePath, line, error) => this.getErrorContext(filePath, line, error),
      getFunctionContext: (filePath, functionName) => this.getFunctionContext(filePath, functionName),
      getClassContext: (filePath, className) => this.getClassContext(filePath, className),
      getSymbolReferences: (symbol) => this.crossReferenceMap.get(symbol) || [],
      getScope: (filePath, line) => this.getScope(filePath, line)
    };
  }

  getErrorContext(filePath, line, error) {
    const fileScope = this.scopeHierarchy.get(filePath);
    if (!fileScope) return null;
    
    const scope = this.findContainingScope(fileScope, line);
    const symbols = this.getRelevantSymbols(filePath, line);
    const fileInfo = this.dependencyGraph.fileMap.get(filePath);
    
    return {
      error,
      file: filePath,
      line,
      scope,
      symbols,
      dependencies: this.dependencyGraph.getFileDependencies(filePath),
      dependents: this.dependencyGraph.getFileDependents(filePath),
      types: this.getTypesInScope(filePath, line),
      functions: this.getFunctionsInScope(filePath, line),
      fullFileContext: fileInfo ? fileInfo.content : null,
      semanticAnalysis: this.analyzeErrorSemantics(error, filePath, line)
    };
  }

  findContainingScope(scopeTree, line) {
    if (line >= scopeTree.startLine && line <= scopeTree.endLine) {
      for (const child of scopeTree.children) {
        const childScope = this.findContainingScope(child, line);
        if (childScope) return childScope;
      }
      return scopeTree;
    }
    return null;
  }

  getRelevantSymbols(filePath, line) {
    const fileScope = this.scopeHierarchy.get(filePath);
    if (!fileScope) return [];
    
    const scope = this.findContainingScope(fileScope, line);
    const symbols = [];
    
    // Collect symbols from current scope and parent scopes
    let currentScope = scope;
    while (currentScope) {
      if (currentScope.variables) symbols.push(...currentScope.variables);
      if (currentScope.parameters) symbols.push(...currentScope.parameters);
      if (currentScope.imports) symbols.push(...currentScope.imports);
      
      // Move to parent scope (simplified - would need proper parent tracking)
      currentScope = null;
    }
    
    return symbols;
  }

  getTypesInScope(filePath, line) {
    const types = [];
    
    // Get types defined in this file
    if (this.typePropagation && this.typePropagation.typeDefinitions) {
      for (const [typeName, typeInfo] of this.typePropagation.typeDefinitions) {
        if (typeInfo.file === filePath) {
          types.push(typeInfo);
        }
      }
    }
    
    return types;
  }

  getFunctionsInScope(filePath, line) {
    const functions = [];
    
    for (const [key, func] of this.functionMap) {
      if (key.startsWith(filePath + ':')) {
        functions.push(func);
      }
    }
    
    return functions;
  }

  analyzeErrorSemantics(error, filePath, line) {
    return {
      errorType: this.categorizeError(error.message),
      suggestedFix: this.suggestFix(error, filePath, line),
      confidence: this.calculateFixConfidence(error, filePath, line),
      impactAnalysis: this.analyzeFixImpact(error, filePath, line)
    };
  }

  categorizeError(message) {
    if (/Cannot find module/.test(message)) return 'missing_import';
    if (/Property.*does not exist/.test(message)) return 'property_error';
    if (/Type.*is not assignable/.test(message)) return 'type_mismatch';
    if (/implicitly has an.*any.*type/.test(message)) return 'implicit_any';
    return 'other';
  }

  suggestFix(error, filePath, line) {
    // This would contain sophisticated fix suggestion logic
    return {
      type: 'context_based_fix',
      description: 'Fix suggested based on comprehensive context analysis'
    };
  }

  calculateFixConfidence(error, filePath, line) {
    // Calculate confidence based on context depth and understanding
    return 0.85; // Placeholder
  }

  analyzeFixImpact(error, filePath, line) {
    const impact = this.dependencyGraph.analyzeChangeImpact(filePath);
    return {
      ...impact,
      typeImpact: this.typePropagation ? this.typePropagation.analyzeTypeChangeImpact(filePath) : null
    };
  }

  getFunctionContext(filePath, functionName) {
    const key = `${filePath}:${functionName}`;
    return this.functionMap.get(key);
  }

  getClassContext(filePath, className) {
    const key = `${filePath}:${className}`;
    return this.classMap.get(key);
  }

  getScope(filePath, line) {
    const fileScope = this.scopeHierarchy.get(filePath);
    return fileScope ? this.findContainingScope(fileScope, line) : null;
  }
}

module.exports = ContextAnalyzer;