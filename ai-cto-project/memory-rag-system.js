#!/usr/bin/env node

/**
 * ENTERPRISE MEMORY & RAG SYSTEM
 * 
 * Advanced Retrieval-Augmented Generation system with persistent memory
 * Eliminates hallucinations through comprehensive knowledge storage and retrieval
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class MemoryRAGSystem {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.memoryDir = path.join(__dirname, 'memory');
    this.vectorStore = new Map(); // Simple vector storage (can be upgraded to ChromaDB/Qdrant)
    this.knowledgeBase = new Map(); // Key-value knowledge storage
    this.contextMemory = new Map(); // Context-aware memory
    this.errorPatterns = new Map(); // Known error patterns and solutions
    this.codePatterns = new Map(); // Successful code patterns
    this.projectMemory = new Map(); // Project-specific knowledge
    this.confidenceThreshold = 0.8; // RAG confidence threshold
    this.memoryVersion = '1.0.0';
  }

  async initialize() {
    console.log('🧠 Initializing Enterprise Memory & RAG System...');
    
    // Create memory directory
    await fs.mkdir(this.memoryDir, { recursive: true });
    
    // Load existing memory
    await this.loadPersistedMemory();
    
    // Initialize knowledge base
    await this.initializeKnowledgeBase();
    
    console.log('✅ Memory & RAG System initialized');
    return this.generateMemoryReport();
  }

  async loadPersistedMemory() {
    try {
      const memoryFiles = [
        'knowledge-base.json',
        'error-patterns.json', 
        'code-patterns.json',
        'project-memory.json',
        'context-memory.json'
      ];
      
      for (const file of memoryFiles) {
        const filePath = path.join(this.memoryDir, file);
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(data);
          
          switch (file) {
            case 'knowledge-base.json':
              this.knowledgeBase = new Map(parsed);
              break;
            case 'error-patterns.json':
              this.errorPatterns = new Map(parsed);
              break;
            case 'code-patterns.json':
              this.codePatterns = new Map(parsed);
              break;
            case 'project-memory.json':
              this.projectMemory = new Map(parsed);
              break;
            case 'context-memory.json':
              this.contextMemory = new Map(parsed);
              break;
          }
        } catch (error) {
          // File doesn't exist, will be created
        }
      }
      
      console.log(`   📚 Loaded ${this.knowledgeBase.size} knowledge entries`);
      console.log(`   🔍 Loaded ${this.errorPatterns.size} error patterns`);
      console.log(`   💡 Loaded ${this.codePatterns.size} code patterns`);
      
    } catch (error) {
      console.warn('   ⚠️  No existing memory found, starting fresh');
    }
  }

  async initializeKnowledgeBase() {
    // Core TypeScript knowledge
    await this.storeKnowledge('typescript-imports', {
      pattern: /Cannot find module.*['"](.+)['"]/,
      category: 'import-error',
      solutions: [
        'Check if the module is installed: npm list {module}',
        'Verify the import path is correct',
        'Check if the module has TypeScript declarations',
        'Add to dependencies or devDependencies'
      ],
      confidence: 0.95
    });
    
    await this.storeKnowledge('typescript-property-errors', {
      pattern: /Property.*does not exist on type/,
      category: 'type-error',
      solutions: [
        'Check if property exists in interface/type definition',
        'Verify spelling of property name',
        'Check if property is optional and needs null check',
        'Extend interface to include missing property'
      ],
      confidence: 0.9
    });
    
    await this.storeKnowledge('typescript-type-assignment', {
      pattern: /Type.*is not assignable to type/,
      category: 'type-mismatch',
      solutions: [
        'Check type compatibility between source and target',
        'Use type assertion if types are compatible',
        'Add proper type conversion/casting',
        'Review generic type constraints'
      ],
      confidence: 0.85
    });
    
    await this.storeKnowledge('typescript-implicit-any', {
      pattern: /implicitly has an.*any.*type/,
      category: 'missing-types',
      solutions: [
        'Add explicit type annotation',
        'Enable strict mode in tsconfig.json',
        'Use type inference where possible',
        'Add return type to functions'
      ],
      confidence: 0.9
    });
  }

  async storeKnowledge(key, knowledge) {
    const entry = {
      ...knowledge,
      timestamp: new Date().toISOString(),
      version: this.memoryVersion,
      hash: this.generateHash(JSON.stringify(knowledge))
    };
    
    this.knowledgeBase.set(key, entry);
  }

  async storeErrorPattern(error, context, solution) {
    const pattern = {
      error: {
        message: error.message,
        code: error.code,
        file: error.filePath,
        line: error.line
      },
      context: {
        scope: context.scope?.type,
        functions: context.functions?.map(f => f.name) || [],
        types: context.types?.map(t => t.name) || [],
        dependencies: context.dependencies || []
      },
      solution: {
        type: solution.type,
        description: solution.description,
        code: solution.code,
        confidence: solution.confidence,
        verified: false // Will be set to true after successful application
      },
      timestamp: new Date().toISOString(),
      usage_count: 1
    };
    
    const key = this.generateErrorPatternKey(error);
    
    if (this.errorPatterns.has(key)) {
      const existing = this.errorPatterns.get(key);
      existing.usage_count++;
      existing.last_seen = new Date().toISOString();
    } else {
      this.errorPatterns.set(key, pattern);
    }
    
    await this.persistMemory();
  }

  async storeSuccessfulFix(error, solution, context) {
    const key = this.generateErrorPatternKey(error);
    
    if (this.errorPatterns.has(key)) {
      const pattern = this.errorPatterns.get(key);
      pattern.solution.verified = true;
      pattern.solution.confidence = Math.min(pattern.solution.confidence + 0.1, 0.99);
      pattern.success_count = (pattern.success_count || 0) + 1;
    }
    
    // Store as successful code pattern
    const codePattern = {
      error_type: this.categorizeError(error.message),
      file_type: path.extname(error.filePath),
      solution_code: solution.code,
      context_signature: this.generateContextSignature(context),
      success_rate: 1.0,
      timestamp: new Date().toISOString()
    };
    
    const codeKey = `fix_${error.code}_${this.generateHash(solution.code)}`;
    this.codePatterns.set(codeKey, codePattern);
    
    await this.persistMemory();
  }

  async retrieveKnowledge(query, context = {}) {
    const results = [];
    
    // Search knowledge base
    for (const [key, knowledge] of this.knowledgeBase) {
      const relevance = this.calculateRelevance(query, knowledge, context);
      if (relevance > this.confidenceThreshold) {
        results.push({
          source: 'knowledge-base',
          key,
          content: knowledge,
          relevance,
          type: 'core-knowledge'
        });
      }
    }
    
    // Search error patterns
    for (const [key, pattern] of this.errorPatterns) {
      const relevance = this.calculateErrorPatternRelevance(query, pattern, context);
      if (relevance > this.confidenceThreshold) {
        results.push({
          source: 'error-patterns',
          key,
          content: pattern,
          relevance,
          type: 'learned-pattern'
        });
      }
    }
    
    // Search code patterns
    const codeRelevance = this.findRelevantCodePatterns(query, context);
    results.push(...codeRelevance);
    
    // Sort by relevance
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  calculateRelevance(query, knowledge, context) {
    let relevance = 0;
    
    // Pattern matching
    if (knowledge.pattern && knowledge.pattern.test && knowledge.pattern.test(query)) {
      relevance += 0.8;
    }
    
    // Category matching
    if (context.category && knowledge.category === context.category) {
      relevance += 0.3;
    }
    
    // Keyword matching
    const queryWords = query.toLowerCase().split(/\s+/);
    const knowledgeText = JSON.stringify(knowledge).toLowerCase();
    const matchingWords = queryWords.filter(word => knowledgeText.includes(word));
    relevance += (matchingWords.length / queryWords.length) * 0.4;
    
    return Math.min(relevance, 1.0);
  }

  calculateErrorPatternRelevance(query, pattern, context) {
    let relevance = 0;
    
    // Error message similarity
    const similarity = this.calculateStringSimilarity(query, pattern.error.message);
    relevance += similarity * 0.6;
    
    // Context matching
    if (context.scope && pattern.context.scope === context.scope) {
      relevance += 0.2;
    }
    
    // File type matching
    if (context.filePath && pattern.error.file) {
      const queryExt = path.extname(context.filePath);
      const patternExt = path.extname(pattern.error.file);
      if (queryExt === patternExt) {
        relevance += 0.1;
      }
    }
    
    // Success rate boost
    if (pattern.solution.verified) {
      relevance += 0.1;
    }
    
    return Math.min(relevance, 1.0);
  }

  findRelevantCodePatterns(query, context) {
    const results = [];
    const errorType = this.categorizeError(query);
    
    for (const [key, pattern] of this.codePatterns) {
      if (pattern.error_type === errorType) {
        results.push({
          source: 'code-patterns',
          key,
          content: pattern,
          relevance: pattern.success_rate * 0.8,
          type: 'proven-solution'
        });
      }
    }
    
    return results;
  }

  async generateContextualResponse(query, context, retrievedKnowledge) {
    const response = {
      query,
      confidence: 0,
      solutions: [],
      reasoning: [],
      sources: []
    };
    
    // Process retrieved knowledge
    for (const knowledge of retrievedKnowledge.slice(0, 5)) { // Top 5 results
      if (knowledge.content.solutions) {
        response.solutions.push(...knowledge.content.solutions);
      }
      
      response.reasoning.push(`From ${knowledge.source}: ${knowledge.type} (${(knowledge.relevance * 100).toFixed(0)}% relevance)`);
      response.sources.push(knowledge.key);
      response.confidence = Math.max(response.confidence, knowledge.relevance);
    }
    
    // Deduplicate solutions
    response.solutions = [...new Set(response.solutions)];
    
    // Generate contextual advice
    if (context.scope) {
      response.reasoning.push(`Context: Within ${context.scope} scope`);
    }
    
    if (context.dependencies && context.dependencies.length > 0) {
      response.reasoning.push(`Dependencies: ${context.dependencies.slice(0, 3).join(', ')}`);
    }
    
    return response;
  }

  async storeProjectMemory(key, data) {
    this.projectMemory.set(key, {
      data,
      timestamp: new Date().toISOString(),
      access_count: 1
    });
    
    await this.persistMemory();
  }

  async getProjectMemory(key) {
    const memory = this.projectMemory.get(key);
    if (memory) {
      memory.access_count++;
      memory.last_accessed = new Date().toISOString();
      return memory.data;
    }
    return null;
  }

  generateErrorPatternKey(error) {
    const keyComponents = [
      error.code || 'unknown',
      this.categorizeError(error.message),
      path.extname(error.filePath || '')
    ];
    
    return this.generateHash(keyComponents.join('_'));
  }

  generateContextSignature(context) {
    const components = [
      context.scope?.type || 'unknown',
      context.functions?.length || 0,
      context.types?.length || 0
    ];
    
    return this.generateHash(components.join('_'));
  }

  calculateStringSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  categorizeError(message) {
    if (/Cannot find module/.test(message)) return 'import-error';
    if (/Property.*does not exist/.test(message)) return 'property-error';
    if (/Type.*is not assignable/.test(message)) return 'type-assignment';
    if (/implicitly has an.*any.*type/.test(message)) return 'implicit-any';
    if (/Expected.*arguments.*but got/.test(message)) return 'argument-mismatch';
    return 'other';
  }

  generateHash(input) {
    return crypto.createHash('md5').update(input).digest('hex').substring(0, 8);
  }

  async persistMemory() {
    try {
      const memoryData = {
        'knowledge-base.json': Array.from(this.knowledgeBase.entries()),
        'error-patterns.json': Array.from(this.errorPatterns.entries()),
        'code-patterns.json': Array.from(this.codePatterns.entries()),
        'project-memory.json': Array.from(this.projectMemory.entries()),
        'context-memory.json': Array.from(this.contextMemory.entries())
      };
      
      for (const [filename, data] of Object.entries(memoryData)) {
        const filePath = path.join(this.memoryDir, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      }
      
    } catch (error) {
      console.warn('⚠️  Failed to persist memory:', error.message);
    }
  }

  generateMemoryReport() {
    return {
      summary: {
        knowledgeEntries: this.knowledgeBase.size,
        errorPatterns: this.errorPatterns.size,
        codePatterns: this.codePatterns.size,
        projectMemories: this.projectMemory.size,
        totalMemorySize: this.calculateMemorySize(),
        version: this.memoryVersion
      },
      
      // Memory access methods
      storeKnowledge: (key, knowledge) => this.storeKnowledge(key, knowledge),
      retrieveKnowledge: (query, context) => this.retrieveKnowledge(query, context),
      storeErrorPattern: (error, context, solution) => this.storeErrorPattern(error, context, solution),
      storeSuccessfulFix: (error, solution, context) => this.storeSuccessfulFix(error, solution, context),
      generateContextualResponse: (query, context, knowledge) => this.generateContextualResponse(query, context, knowledge),
      storeProjectMemory: (key, data) => this.storeProjectMemory(key, data),
      getProjectMemory: (key) => this.getProjectMemory(key),
      
      // Analysis methods
      getErrorPatternStats: () => this.getErrorPatternStats(),
      getSuccessfulPatterns: () => this.getSuccessfulPatterns(),
      getMemoryHealth: () => this.getMemoryHealth()
    };
  }

  calculateMemorySize() {
    const totalEntries = this.knowledgeBase.size + this.errorPatterns.size + 
                        this.codePatterns.size + this.projectMemory.size;
    return `${totalEntries} entries`;
  }

  getErrorPatternStats() {
    const stats = {
      totalPatterns: this.errorPatterns.size,
      verifiedPatterns: 0,
      averageSuccessRate: 0,
      mostCommonErrors: {}
    };
    
    let totalSuccessRate = 0;
    let verifiedCount = 0;
    
    for (const [key, pattern] of this.errorPatterns) {
      if (pattern.solution.verified) {
        stats.verifiedPatterns++;
        totalSuccessRate += pattern.solution.confidence;
        verifiedCount++;
      }
      
      const errorType = this.categorizeError(pattern.error.message);
      stats.mostCommonErrors[errorType] = (stats.mostCommonErrors[errorType] || 0) + 1;
    }
    
    stats.averageSuccessRate = verifiedCount > 0 ? totalSuccessRate / verifiedCount : 0;
    
    return stats;
  }

  getSuccessfulPatterns() {
    const successful = [];
    
    for (const [key, pattern] of this.errorPatterns) {
      if (pattern.solution.verified && pattern.solution.confidence > 0.8) {
        successful.push({
          key,
          errorType: this.categorizeError(pattern.error.message),
          confidence: pattern.solution.confidence,
          usageCount: pattern.usage_count,
          successCount: pattern.success_count || 0
        });
      }
    }
    
    return successful.sort((a, b) => b.confidence - a.confidence);
  }

  getMemoryHealth() {
    const health = {
      status: 'healthy',
      issues: [],
      recommendations: []
    };
    
    // Check memory size
    const totalSize = this.knowledgeBase.size + this.errorPatterns.size + this.codePatterns.size;
    if (totalSize < 10) {
      health.issues.push('Low memory content - system still learning');
      health.recommendations.push('Continue using the system to build knowledge base');
    }
    
    // Check verification rate
    const verifiedRate = this.getErrorPatternStats().verifiedPatterns / Math.max(this.errorPatterns.size, 1);
    if (verifiedRate < 0.5) {
      health.issues.push('Low verification rate for error patterns');
      health.recommendations.push('Validate more successful fixes to improve accuracy');
    }
    
    if (health.issues.length === 0) {
      health.status = 'excellent';
    } else if (health.issues.length <= 2) {
      health.status = 'good';
    } else {
      health.status = 'needs-attention';
    }
    
    return health;
  }
}

module.exports = MemoryRAGSystem;