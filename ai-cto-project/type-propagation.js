#!/usr/bin/env node

/**
 * ENTERPRISE TYPE PROPAGATION ANALYZER
 * 
 * Tracks how type changes affect your entire Findawise Empire codebase
 * Maps type flow, inheritance chains, and cross-file type dependencies
 */

const fs = require('fs').promises;
const path = require('path');

class TypePropagationAnalyzer {
  constructor(projectRoot, dependencyGraph) {
    this.projectRoot = projectRoot;
    this.dependencyGraph = dependencyGraph;
    this.typeDefinitions = new Map(); // typeName -> definition info
    this.typeUsages = new Map(); // typeName -> [usage locations]
    this.typeInheritance = new Map(); // typeName -> parent types
    this.typeExtensions = new Map(); // typeName -> child types
    this.interfaceImplementations = new Map(); // interface -> implementing classes
    this.genericTypes = new Map(); // generic type -> type parameters
    this.typeAliases = new Map(); // alias -> actual type
    this.crossFileTypeFlow = new Map(); // tracks type flow across files
  }

  async analyzeTypeSystem() {
    console.log('🔍 Analyzing type propagation and inheritance...');
    
    // Phase 1: Extract all type definitions
    await this.extractTypeDefinitions();
    
    // Phase 2: Map type usage across files
    await this.mapTypeUsages();
    
    // Phase 3: Build inheritance hierarchy
    await this.buildInheritanceHierarchy();
    
    // Phase 4: Analyze generic type constraints
    await this.analyzeGenericTypes();
    
    // Phase 5: Map cross-file type flow
    await this.mapCrossFileTypeFlow();
    
    // Phase 6: Build type dependency graph
    await this.buildTypeDependencyGraph();
    
    console.log('✅ Type propagation analysis complete');
    return this.generateTypeReport();
  }

  async extractTypeDefinitions() {
    for (const [filePath, fileInfo] of this.dependencyGraph.fileMap) {
      const content = fileInfo.content;
      
      // Extract interfaces
      const interfaces = this.extractInterfaces(content, filePath);
      interfaces.forEach(iface => {
        this.typeDefinitions.set(iface.name, {
          ...iface,
          file: filePath,
          kind: 'interface'
        });
      });
      
      // Extract type aliases
      const typeAliases = this.extractTypeAliases(content, filePath);
      typeAliases.forEach(alias => {
        this.typeDefinitions.set(alias.name, {
          ...alias,
          file: filePath,
          kind: 'type'
        });
        this.typeAliases.set(alias.name, alias.definition);
      });
      
      // Extract classes
      const classes = this.extractClassDefinitions(content, filePath);
      classes.forEach(cls => {
        this.typeDefinitions.set(cls.name, {
          ...cls,
          file: filePath,
          kind: 'class'
        });
      });
      
      // Extract enums
      const enums = this.extractEnums(content, filePath);
      enums.forEach(enumDef => {
        this.typeDefinitions.set(enumDef.name, {
          ...enumDef,
          file: filePath,
          kind: 'enum'
        });
      });
    }
  }

  extractInterfaces(content, filePath) {
    const interfaces = [];
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:<([^>]+)>)?\s*(?:extends\s+([^{]+))?\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
    let match;
    
    while ((match = interfaceRegex.exec(content)) !== null) {
      const [fullMatch, name, generics, extendsClause, body] = match;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      interfaces.push({
        name,
        generics: generics ? this.parseGenerics(generics) : [],
        extends: extendsClause ? this.parseExtends(extendsClause) : [],
        properties: this.parseInterfaceBody(body),
        line: lineNumber,
        exported: fullMatch.includes('export')
      });
    }
    
    return interfaces;
  }

  extractTypeAliases(content, filePath) {
    const typeAliases = [];
    const typeRegex = /(?:export\s+)?type\s+(\w+)(?:<([^>]+)>)?\s*=\s*([^;\n]+)/g;
    let match;
    
    while ((match = typeRegex.exec(content)) !== null) {
      const [fullMatch, name, generics, definition] = match;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      typeAliases.push({
        name,
        generics: generics ? this.parseGenerics(generics) : [],
        definition: definition.trim(),
        line: lineNumber,
        exported: fullMatch.includes('export')
      });
    }
    
    return typeAliases;
  }

  extractClassDefinitions(content, filePath) {
    const classes = [];
    const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:<([^>]+)>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
    let match;
    
    while ((match = classRegex.exec(content)) !== null) {
      const [fullMatch, name, generics, extendsClass, implementsInterfaces] = match;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      classes.push({
        name,
        generics: generics ? this.parseGenerics(generics) : [],
        extends: extendsClass || null,
        implements: implementsInterfaces ? this.parseImplements(implementsInterfaces) : [],
        line: lineNumber,
        exported: fullMatch.includes('export'),
        abstract: fullMatch.includes('abstract')
      });
    }
    
    return classes;
  }

  extractEnums(content, filePath) {
    const enums = [];
    const enumRegex = /(?:export\s+)?enum\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = enumRegex.exec(content)) !== null) {
      const [fullMatch, name, body] = match;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      enums.push({
        name,
        values: this.parseEnumBody(body),
        line: lineNumber,
        exported: fullMatch.includes('export')
      });
    }
    
    return enums;
  }

  parseGenerics(genericsStr) {
    return genericsStr.split(',').map(g => {
      const parts = g.trim().split(/\s+extends\s+/);
      return {
        name: parts[0].trim(),
        constraint: parts[1] ? parts[1].trim() : null
      };
    });
  }

  parseExtends(extendsStr) {
    return extendsStr.split(',').map(e => e.trim());
  }

  parseImplements(implementsStr) {
    return implementsStr.split(',').map(i => i.trim());
  }

  parseInterfaceBody(body) {
    const properties = [];
    const propertyRegex = /(\w+)(\?)?:\s*([^;,\n]+)/g;
    let match;
    
    while ((match = propertyRegex.exec(body)) !== null) {
      const [, name, optional, type] = match;
      properties.push({
        name,
        type: type.trim(),
        optional: !!optional
      });
    }
    
    return properties;
  }

  parseEnumBody(body) {
    return body.split(',').map(value => {
      const [name, val] = value.split('=').map(v => v.trim());
      return { name, value: val || null };
    }).filter(v => v.name);
  }

  async mapTypeUsages() {
    for (const [filePath, fileInfo] of this.dependencyGraph.fileMap) {
      const content = fileInfo.content;
      
      // Find all type references
      for (const [typeName] of this.typeDefinitions) {
        const usages = this.findTypeUsageInContent(content, typeName, filePath);
        
        if (!this.typeUsages.has(typeName)) {
          this.typeUsages.set(typeName, []);
        }
        
        this.typeUsages.get(typeName).push(...usages);
      }
    }
  }

  findTypeUsageInContent(content, typeName, filePath) {
    const usages = [];
    const lines = content.split('\n');
    
    // Look for type annotations, generic parameters, etc.
    const patterns = [
      new RegExp(`:\\s*${typeName}(?![\\w])`, 'g'), // Type annotations
      new RegExp(`<${typeName}(?![\\w])`, 'g'), // Generic parameters
      new RegExp(`extends\\s+${typeName}(?![\\w])`, 'g'), // Class/interface extensions
      new RegExp(`implements\\s+[^{]*${typeName}(?![\\w])`, 'g'), // Interface implementations
      new RegExp(`as\\s+${typeName}(?![\\w])`, 'g'), // Type assertions
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const context = this.getTypeUsageContext(lines, lineNumber - 1);
        
        usages.push({
          file: filePath,
          line: lineNumber,
          context,
          usageType: this.determineUsageType(match[0])
        });
      }
    });
    
    return usages;
  }

  getTypeUsageContext(lines, lineIndex) {
    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(lines.length, lineIndex + 3);
    return lines.slice(start, end).join('\n');
  }

  determineUsageType(matchStr) {
    if (matchStr.includes(':')) return 'annotation';
    if (matchStr.includes('<')) return 'generic';
    if (matchStr.includes('extends')) return 'inheritance';
    if (matchStr.includes('implements')) return 'implementation';
    if (matchStr.includes('as')) return 'assertion';
    return 'reference';
  }

  async buildInheritanceHierarchy() {
    for (const [typeName, typeInfo] of this.typeDefinitions) {
      if (typeInfo.kind === 'interface' && typeInfo.extends) {
        typeInfo.extends.forEach(parentType => {
          if (!this.typeInheritance.has(typeName)) {
            this.typeInheritance.set(typeName, []);
          }
          this.typeInheritance.get(typeName).push(parentType);
          
          if (!this.typeExtensions.has(parentType)) {
            this.typeExtensions.set(parentType, []);
          }
          this.typeExtensions.get(parentType).push(typeName);
        });
      }
      
      if (typeInfo.kind === 'class') {
        if (typeInfo.extends) {
          if (!this.typeInheritance.has(typeName)) {
            this.typeInheritance.set(typeName, []);
          }
          this.typeInheritance.get(typeName).push(typeInfo.extends);
          
          if (!this.typeExtensions.has(typeInfo.extends)) {
            this.typeExtensions.set(typeInfo.extends, []);
          }
          this.typeExtensions.get(typeInfo.extends).push(typeName);
        }
        
        if (typeInfo.implements) {
          typeInfo.implements.forEach(interfaceName => {
            if (!this.interfaceImplementations.has(interfaceName)) {
              this.interfaceImplementations.set(interfaceName, []);
            }
            this.interfaceImplementations.get(interfaceName).push(typeName);
          });
        }
      }
    }
  }

  async analyzeGenericTypes() {
    for (const [typeName, typeInfo] of this.typeDefinitions) {
      if (typeInfo.generics && typeInfo.generics.length > 0) {
        this.genericTypes.set(typeName, {
          parameters: typeInfo.generics,
          constraints: typeInfo.generics.filter(g => g.constraint).map(g => ({
            param: g.name,
            constraint: g.constraint
          }))
        });
      }
    }
  }

  async mapCrossFileTypeFlow() {
    for (const [filePath, dependencies] of this.dependencyGraph.dependencyGraph) {
      const fileTypes = this.getTypesDefinedInFile(filePath);
      const importedTypes = this.getTypesImportedByFile(filePath);
      
      this.crossFileTypeFlow.set(filePath, {
        defines: fileTypes,
        imports: importedTypes,
        exports: fileTypes.filter(t => this.typeDefinitions.get(t.name)?.exported)
      });
    }
  }

  getTypesDefinedInFile(filePath) {
    const types = [];
    for (const [typeName, typeInfo] of this.typeDefinitions) {
      if (typeInfo.file === filePath) {
        types.push({
          name: typeName,
          kind: typeInfo.kind,
          exported: typeInfo.exported
        });
      }
    }
    return types;
  }

  getTypesImportedByFile(filePath) {
    const fileInfo = this.dependencyGraph.fileMap.get(filePath);
    if (!fileInfo) return [];
    
    const importedTypes = [];
    for (const typeImport of fileInfo.typeImports || []) {
      importedTypes.push({
        types: typeImport.imports,
        from: typeImport.from,
        line: typeImport.line
      });
    }
    
    return importedTypes;
  }

  async buildTypeDependencyGraph() {
    this.typeDependencyGraph = new Map();
    
    for (const [typeName, typeInfo] of this.typeDefinitions) {
      const dependencies = this.findTypeDependencies(typeInfo);
      this.typeDependencyGraph.set(typeName, dependencies);
    }
  }

  findTypeDependencies(typeInfo) {
    const dependencies = new Set();
    
    // Add inheritance dependencies
    if (typeInfo.extends) {
      typeInfo.extends.forEach(parent => dependencies.add(parent));
    }
    
    // Add implementation dependencies
    if (typeInfo.implements) {
      typeInfo.implements.forEach(iface => dependencies.add(iface));
    }
    
    // Add property type dependencies
    if (typeInfo.properties) {
      typeInfo.properties.forEach(prop => {
        const propTypes = this.extractTypesFromTypeString(prop.type);
        propTypes.forEach(t => dependencies.add(t));
      });
    }
    
    return Array.from(dependencies);
  }

  extractTypesFromTypeString(typeStr) {
    const types = new Set();
    
    // Simple extraction - could be more sophisticated
    const typeRegex = /\b([A-Z]\w*)\b/g;
    let match;
    
    while ((match = typeRegex.exec(typeStr)) !== null) {
      if (this.typeDefinitions.has(match[1])) {
        types.add(match[1]);
      }
    }
    
    return Array.from(types);
  }

  generateTypeReport() {
    return {
      summary: {
        totalTypes: this.typeDefinitions.size,
        interfaces: Array.from(this.typeDefinitions.values()).filter(t => t.kind === 'interface').length,
        classes: Array.from(this.typeDefinitions.values()).filter(t => t.kind === 'class').length,
        typeAliases: Array.from(this.typeDefinitions.values()).filter(t => t.kind === 'type').length,
        enums: Array.from(this.typeDefinitions.values()).filter(t => t.kind === 'enum').length,
        genericTypes: this.genericTypes.size,
        inheritanceChains: this.typeInheritance.size
      },
      
      typeDefinitions: this.typeDefinitions,
      typeUsages: this.typeUsages,
      typeInheritance: this.typeInheritance,
      typeExtensions: this.typeExtensions,
      interfaceImplementations: this.interfaceImplementations,
      genericTypes: this.genericTypes,
      typeAliases: this.typeAliases,
      crossFileTypeFlow: this.crossFileTypeFlow,
      typeDependencyGraph: this.typeDependencyGraph,
      
      // Analysis methods
      analyzeTypeChangeImpact: (typeName) => this.analyzeTypeChangeImpact(typeName),
      getTypeHierarchy: (typeName) => this.getTypeHierarchy(typeName),
      findBreakingChanges: (oldType, newType) => this.findBreakingChanges(oldType, newType),
      getTypeUsagePattern: (typeName) => this.getTypeUsagePattern(typeName)
    };
  }

  analyzeTypeChangeImpact(typeName) {
    const directUsages = this.typeUsages.get(typeName) || [];
    const children = this.typeExtensions.get(typeName) || [];
    const implementations = this.interfaceImplementations.get(typeName) || [];
    
    const affectedFiles = new Set();
    directUsages.forEach(usage => affectedFiles.add(usage.file));
    
    // Analyze children impact
    const childrenImpact = [];
    children.forEach(child => {
      const childUsages = this.typeUsages.get(child) || [];
      childUsages.forEach(usage => affectedFiles.add(usage.file));
      childrenImpact.push({
        type: child,
        usages: childUsages.length
      });
    });
    
    return {
      directUsages: directUsages.length,
      affectedFiles: Array.from(affectedFiles),
      childrenAffected: children.length,
      implementationsAffected: implementations.length,
      childrenImpact,
      severity: this.calculateChangeSeverity(directUsages.length, children.length, implementations.length)
    };
  }

  getTypeHierarchy(typeName) {
    const hierarchy = {
      type: typeName,
      parents: [],
      children: [],
      implementations: []
    };
    
    // Get parents
    const parents = this.typeInheritance.get(typeName) || [];
    hierarchy.parents = parents.map(parent => this.getTypeHierarchy(parent));
    
    // Get children
    const children = this.typeExtensions.get(typeName) || [];
    hierarchy.children = children;
    
    // Get implementations
    const implementations = this.interfaceImplementations.get(typeName) || [];
    hierarchy.implementations = implementations;
    
    return hierarchy;
  }

  findBreakingChanges(oldTypeInfo, newTypeInfo) {
    const breakingChanges = [];
    
    if (!oldTypeInfo || !newTypeInfo) {
      return breakingChanges;
    }
    
    // Check removed properties
    if (oldTypeInfo.properties && newTypeInfo.properties) {
      const oldProps = new Set(oldTypeInfo.properties.map(p => p.name));
      const newProps = new Set(newTypeInfo.properties.map(p => p.name));
      
      for (const oldProp of oldProps) {
        if (!newProps.has(oldProp)) {
          breakingChanges.push({
            type: 'property_removed',
            property: oldProp,
            severity: 'high'
          });
        }
      }
      
      // Check changed property types
      const oldPropMap = new Map(oldTypeInfo.properties.map(p => [p.name, p]));
      const newPropMap = new Map(newTypeInfo.properties.map(p => [p.name, p]));
      
      for (const [propName, oldProp] of oldPropMap) {
        const newProp = newPropMap.get(propName);
        if (newProp && oldProp.type !== newProp.type) {
          breakingChanges.push({
            type: 'property_type_changed',
            property: propName,
            oldType: oldProp.type,
            newType: newProp.type,
            severity: 'medium'
          });
        }
        
        if (newProp && !oldProp.optional && newProp.optional) {
          breakingChanges.push({
            type: 'property_made_optional',
            property: propName,
            severity: 'low'
          });
        }
        
        if (newProp && oldProp.optional && !newProp.optional) {
          breakingChanges.push({
            type: 'property_made_required',
            property: propName,
            severity: 'high'
          });
        }
      }
    }
    
    return breakingChanges;
  }

  getTypeUsagePattern(typeName) {
    const usages = this.typeUsages.get(typeName) || [];
    const pattern = {
      totalUsages: usages.length,
      fileDistribution: {},
      usageTypes: {},
      mostUsedInFiles: []
    };
    
    usages.forEach(usage => {
      // File distribution
      pattern.fileDistribution[usage.file] = (pattern.fileDistribution[usage.file] || 0) + 1;
      
      // Usage types
      pattern.usageTypes[usage.usageType] = (pattern.usageTypes[usage.usageType] || 0) + 1;
    });
    
    // Most used in files
    pattern.mostUsedInFiles = Object.entries(pattern.fileDistribution)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([file, count]) => ({ file, count }));
    
    return pattern;
  }

  calculateChangeSeverity(directUsages, children, implementations) {
    const score = directUsages + (children * 2) + (implementations * 1.5);
    
    if (score > 20) return 'critical';
    if (score > 10) return 'high';
    if (score > 5) return 'medium';
    return 'low';
  }
}

module.exports = TypePropagationAnalyzer;