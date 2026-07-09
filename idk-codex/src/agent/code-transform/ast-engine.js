/**
 * AST-Driven Code Modification Engine
 *
 * Implements surgical code modifications using Abstract Syntax Trees (AST)
 * to preserve formatting, imports, type annotations, and code structure.
 *
 * Features:
 * - Parse code to AST with full syntax support (JS, JSX, TS, TSX)
 * - Semantic analysis (imports, exports, scopes, declarations)
 * - Surgical modifications without breaking existing structure
 * - Code generation with preserved formatting
 *
 * @module ast-engine
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import fs from 'fs/promises';
import path from 'path';
import logger from '../../utils/logger.js';

export class ASTModificationEngine {
  constructor() {
    this.supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
  }

  /**
   * Check if file is supported for AST modification
   *
   * @param {string} filePath - Path to file
   * @returns {boolean} True if supported
   */
  isSupported(filePath) {
    const ext = path.extname(filePath);
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Parse file to AST with full type/import preservation
   *
   * @param {string} filePath - Path to source file
   * @returns {Promise<Object>} Parsed AST
   */
  async parseToAST(filePath) {
    try {
      const source = await fs.readFile(filePath, 'utf-8');

      const ext = path.extname(filePath);
      const plugins = this.getParserPlugins(ext);

      const ast = parser.parse(source, {
        sourceType: 'module',
        plugins,
        // Preserve comments and location info
        attachComment: true,
        ranges: true,
        tokens: true
      });

      logger.debug('AST parsed successfully', {
        filePath,
        extension: ext,
        plugins,
        nodeCount: this.countNodes(ast)
      });

      return ast;

    } catch (error) {
      logger.error('AST parsing failed', {
        filePath,
        error: error.message,
        line: error.loc?.line,
        column: error.loc?.column
      });

      throw new Error(`Cannot parse ${filePath}: ${error.message}`);
    }
  }

  /**
   * Get appropriate parser plugins for file extension
   *
   * @param {string} ext - File extension
   * @returns {string[]} Parser plugins
   */
  getParserPlugins(ext) {
    const basePlugins = [
      'decorators-legacy',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'dynamicImport',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'functionBind',
      'importMeta',
      'nullishCoalescingOperator',
      'numericSeparator',
      'objectRestSpread',
      'optionalCatchBinding',
      'optionalChaining',
      'topLevelAwait'
    ];

    switch (ext) {
      case '.ts':
        return [...basePlugins, 'typescript'];
      case '.tsx':
        return [...basePlugins, 'typescript', 'jsx'];
      case '.jsx':
        return [...basePlugins, 'jsx'];
      default:
        return basePlugins;
    }
  }

  /**
   * Count total AST nodes (for debugging)
   *
   * @param {Object} ast - AST object
   * @returns {number} Node count
   */
  countNodes(ast) {
    let count = 0;
    traverse(ast, {
      enter() {
        count++;
      }
    });
    return count;
  }

  /**
   * Analyze semantic context (imports, exports, scopes, declarations)
   *
   * @param {Object} ast - Parsed AST
   * @returns {Promise<Object>} Semantic context
   */
  async analyzeSemantics(ast) {
    const context = {
      imports: [],
      exports: [],
      declarations: {
        functions: [],
        classes: [],
        variables: [],
        constants: []
      },
      scopes: [],
      dependencies: new Set()
    };

    traverse(ast, {
      // Import declarations
      ImportDeclaration(path) {
        const importInfo = {
          source: path.node.source.value,
          specifiers: path.node.specifiers.map(s => ({
            local: s.local.name,
            imported: s.type === 'ImportDefaultSpecifier'
              ? 'default'
              : s.type === 'ImportNamespaceSpecifier'
              ? '*'
              : s.imported.name,
            type: s.type
          })),
          loc: path.node.loc
        };

        context.imports.push(importInfo);
        context.dependencies.add(path.node.source.value);
      },

      // Export declarations
      ExportNamedDeclaration(path) {
        context.exports.push({
          type: 'named',
          declaration: path.node.declaration,
          specifiers: path.node.specifiers,
          loc: path.node.loc
        });
      },

      ExportDefaultDeclaration(path) {
        context.exports.push({
          type: 'default',
          declaration: path.node.declaration,
          loc: path.node.loc
        });
      },

      // Function declarations
      FunctionDeclaration(path) {
        if (path.node.id) {
          context.declarations.functions.push({
            name: path.node.id.name,
            params: path.node.params.map(p => this.getParamName(p)),
            async: path.node.async,
            generator: path.node.generator,
            scope: path.scope.uid,
            loc: path.node.loc
          });
        }
      },

      // Arrow functions assigned to variables
      VariableDeclaration(path) {
        path.node.declarations.forEach(decl => {
          const isArrowFunction = t.isArrowFunctionExpression(decl.init);
          const isFunctionExpression = t.isFunctionExpression(decl.init);

          if (isArrowFunction || isFunctionExpression) {
            context.declarations.functions.push({
              name: decl.id.name,
              params: decl.init.params.map(p => this.getParamName(p)),
              async: decl.init.async,
              arrow: isArrowFunction,
              scope: path.scope.uid,
              loc: path.node.loc
            });
          } else {
            // Regular variable
            const declType = path.node.kind === 'const' ? 'constants' : 'variables';
            context.declarations[declType].push({
              name: decl.id.name,
              kind: path.node.kind,
              scope: path.scope.uid,
              loc: path.node.loc
            });
          }
        });
      },

      // Class declarations
      ClassDeclaration(path) {
        if (path.node.id) {
          context.declarations.classes.push({
            name: path.node.id.name,
            superClass: path.node.superClass?.name,
            methods: this.extractClassMethods(path.node.body.body),
            scope: path.scope.uid,
            loc: path.node.loc
          });
        }
      }
    });

    // Convert dependencies Set to Array
    context.dependencies = Array.from(context.dependencies);

    logger.debug('Semantic analysis complete', {
      imports: context.imports.length,
      exports: context.exports.length,
      functions: context.declarations.functions.length,
      classes: context.declarations.classes.length,
      variables: context.declarations.variables.length,
      constants: context.declarations.constants.length,
      dependencies: context.dependencies.length
    });

    return context;
  }

  /**
   * Extract parameter name from AST node
   *
   * @param {Object} param - Parameter AST node
   * @returns {string} Parameter name
   */
  getParamName(param) {
    if (t.isIdentifier(param)) {
      return param.name;
    } else if (t.isAssignmentPattern(param)) {
      return this.getParamName(param.left);
    } else if (t.isObjectPattern(param)) {
      return '{...}';
    } else if (t.isArrayPattern(param)) {
      return '[...]';
    } else if (t.isRestElement(param)) {
      return `...${this.getParamName(param.argument)}`;
    }
    return 'unknown';
  }

  /**
   * Extract class methods
   *
   * @param {Array} body - Class body nodes
   * @returns {Array} Method information
   */
  extractClassMethods(body) {
    return body
      .filter(node => t.isClassMethod(node))
      .map(method => ({
        name: method.key.name,
        kind: method.kind, // 'constructor', 'method', 'get', 'set'
        static: method.static,
        async: method.async,
        params: method.params.map(p => this.getParamName(p))
      }));
  }

  /**
   * Apply surgical modification to AST
   *
   * This is a generic modification function. Specific modification
   * strategies should be implemented based on targetChange.type.
   *
   * @param {Object} ast - Original AST
   * @param {Object} targetChange - Modification specification
   * @param {Object} semanticContext - Semantic analysis results
   * @returns {Promise<Object>} Modified AST
   */
  async applySurgicalChange(ast, targetChange, semanticContext) {
    const { type, target, modification } = targetChange;

    logger.info('Applying surgical modification', {
      type,
      target: JSON.stringify(target)
    });

    switch (type) {
      case 'modify-function':
        return this.modifyFunction(ast, target, modification);

      case 'add-import':
        return this.addImport(ast, modification);

      case 'modify-class-method':
        return this.modifyClassMethod(ast, target, modification);

      case 'add-function':
        return this.addFunction(ast, modification, semanticContext);

      case 'replace-expression':
        return this.replaceExpression(ast, target, modification);

      default:
        logger.warn('Unknown modification type, skipping', { type });
        return ast;
    }
  }

  /**
   * Modify function body
   *
   * @param {Object} ast - AST
   * @param {Object} target - Target specification
   * @param {Object} modification - Modification details
   * @returns {Object} Modified AST
   */
  modifyFunction(ast, target, modification) {
    traverse(ast, {
      FunctionDeclaration(path) {
        if (path.node.id && path.node.id.name === target.functionName) {
          logger.debug('Found target function', { name: target.functionName });

          // Modify function based on modification.action
          if (modification.action === 'replace-body') {
            // Parse new body and replace
            const newBodyAST = parser.parseExpression(`() => { ${modification.newBody} }`);
            if (t.isArrowFunctionExpression(newBodyAST)) {
              path.node.body = newBodyAST.body;
            }
          } else if (modification.action === 'add-statement') {
            // Add statement to beginning or end
            const position = modification.position || 'end';
            const statementAST = parser.parse(modification.statement).program.body[0];

            if (position === 'start') {
              path.node.body.body.unshift(statementAST);
            } else {
              path.node.body.body.push(statementAST);
            }
          }
        }
      }
    });

    return ast;
  }

  /**
   * Add import statement
   *
   * @param {Object} ast - AST
   * @param {Object} modification - Import details
   * @returns {Object} Modified AST
   */
  addImport(ast, modification) {
    const { source, specifiers } = modification;

    // Check if import already exists
    let importExists = false;

    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === source) {
          importExists = true;
          logger.debug('Import already exists', { source });
        }
      }
    });

    if (!importExists) {
      // Create import declaration
      const importSpecifiers = specifiers.map(spec => {
        if (spec.type === 'default') {
          return t.importDefaultSpecifier(t.identifier(spec.local));
        } else if (spec.type === 'namespace') {
          return t.importNamespaceSpecifier(t.identifier(spec.local));
        } else {
          return t.importSpecifier(
            t.identifier(spec.local),
            t.identifier(spec.imported || spec.local)
          );
        }
      });

      const importDeclaration = t.importDeclaration(
        importSpecifiers,
        t.stringLiteral(source)
      );

      // Add to top of program
      ast.program.body.unshift(importDeclaration);

      logger.info('Added import', { source, specifiers });
    }

    return ast;
  }

  /**
   * Modify class method
   *
   * @param {Object} ast - AST
   * @param {Object} target - Target specification
   * @param {Object} modification - Modification details
   * @returns {Object} Modified AST
   */
  modifyClassMethod(ast, target, modification) {
    traverse(ast, {
      ClassDeclaration(path) {
        if (path.node.id && path.node.id.name === target.className) {
          const method = path.node.body.body.find(
            m => t.isClassMethod(m) && m.key.name === target.methodName
          );

          if (method && modification.action === 'replace-body') {
            const newBodyAST = parser.parseExpression(`() => { ${modification.newBody} }`);
            if (t.isArrowFunctionExpression(newBodyAST)) {
              method.body = newBodyAST.body;
            }
          }
        }
      }
    });

    return ast;
  }

  /**
   * Add new function to program
   *
   * @param {Object} ast - AST
   * @param {Object} modification - Function details
   * @param {Object} semanticContext - Semantic context
   * @returns {Object} Modified AST
   */
  addFunction(ast, modification, semanticContext) {
    const { name, params, body, async, export: shouldExport } = modification;

    // Parse function
    const functionCode = `${async ? 'async ' : ''}function ${name}(${params.join(', ')}) { ${body} }`;
    const functionAST = parser.parse(functionCode).program.body[0];

    if (shouldExport) {
      const exportDeclaration = t.exportNamedDeclaration(functionAST, []);
      ast.program.body.push(exportDeclaration);
    } else {
      ast.program.body.push(functionAST);
    }

    logger.info('Added function', { name, params, async, export: shouldExport });

    return ast;
  }

  /**
   * Replace expression
   *
   * @param {Object} ast - AST
   * @param {Object} target - Target specification
   * @param {Object} modification - Replacement expression
   * @returns {Object} Modified AST
   */
  replaceExpression(ast, target, modification) {
    // Generic expression replacement logic
    // This would need more specific implementation based on target.type

    logger.warn('Expression replacement not fully implemented', { target, modification });
    return ast;
  }

  /**
   * Generate code from modified AST
   *
   * @param {Object} ast - Modified AST
   * @param {Object} options - Generation options
   * @returns {string} Generated code
   */
  generateCode(ast, options = {}) {
    const { code } = generate(ast, {
      retainLines: options.retainLines !== false,
      compact: options.compact || false,
      concise: options.concise || false,
      comments: options.comments !== false,
      ...options
    });

    logger.debug('Code generated from AST', {
      lines: code.split('\n').length,
      size: code.length
    });

    return code;
  }

  /**
   * Complete modification workflow
   *
   * @param {string} filePath - Path to file
   * @param {Object} targetChange - Modification specification
   * @returns {Promise<string>} Modified code
   */
  async modifyFile(filePath, targetChange) {
    try {
      logger.info('Starting AST modification workflow', { filePath });

      // Step 1: Parse to AST
      const ast = await this.parseToAST(filePath);

      // Step 2: Analyze semantics
      const semanticContext = await this.analyzeSemantics(ast);

      // Step 3: Apply modification
      const modifiedAST = await this.applySurgicalChange(ast, targetChange, semanticContext);

      // Step 4: Generate code
      const modifiedCode = this.generateCode(modifiedAST);

      logger.info('AST modification workflow complete', {
        filePath,
        modificationType: targetChange.type
      });

      return modifiedCode;

    } catch (error) {
      logger.error('AST modification workflow failed', {
        filePath,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }
}

export default ASTModificationEngine;
