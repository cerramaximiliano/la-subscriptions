const logger = require('./logger');

/**
 * Reemplaza variables en un template usando formato {{variable}}
 * Soporta condicionales simples {{#if variable}}...{{/if}} y {{#if variable}}...{{else}}...{{/if}}
 * Soporta comparaciones {{#if (eq variable "value")}}...{{/if}}
 * Soporta iteraciones {{#each array}}...{{/each}}
 * 
 * @param {string} template - El template con variables
 * @param {object} data - Objeto con los valores para reemplazar
 * @returns {string} - El template con las variables reemplazadas
 */
function fillTemplate(template, data) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  let result = template;

  try {
    // Procesar iteraciones {{#each array}}...{{/each}}
    result = processEach(result, data);

    // Procesar condicionales {{#if}}...{{/if}}
    result = processConditionals(result, data);

    // Reemplazar variables simples {{variable}}
    result = replaceVariables(result, data);

    return result;
  } catch (error) {
    logger.error('Error procesando template:', error);
    return template; // Retornar template original en caso de error
  }
}

/**
 * Procesa iteraciones {{#each array}}...{{/each}}
 */
function processEach(template, data) {
  const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  
  return template.replace(eachRegex, (match, arrayName, content) => {
    const array = getNestedValue(data, arrayName);
    
    if (!Array.isArray(array)) {
      return '';
    }

    return array.map((item, index) => {
      // Crear contexto local para la iteración
      const localContext = {
        ...data,
        this: item,
        '@index': index,
        '@first': index === 0,
        '@last': index === array.length - 1
      };

      // Procesar el contenido con el contexto local
      let itemContent = content;
      
      // Reemplazar {{this}}
      itemContent = itemContent.replace(/\{\{this\}\}/g, item);
      
      // Reemplazar otras variables en el contexto local
      itemContent = replaceVariables(itemContent, localContext);
      
      return itemContent;
    }).join('');
  });
}

/**
 * Procesa condicionales {{#if}}...{{/if}}
 */
function processConditionals(template, data) {
  // Procesar comparaciones {{#if (eq variable "value")}}
  const comparisonRegex = /\{\{#if\s+\(eq\s+(\w+)\s+"([^"]+)"\)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  
  template = template.replace(comparisonRegex, (match, variable, compareValue, ifContent, elseContent = '') => {
    const value = getNestedValue(data, variable);
    const condition = value === compareValue;
    return condition ? processContent(ifContent, data) : processContent(elseContent, data);
  });

  // Procesar condicionales simples {{#if variable}}
  const simpleIfRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  
  return template.replace(simpleIfRegex, (match, variable, ifContent, elseContent = '') => {
    const value = getNestedValue(data, variable);
    const condition = isTruthy(value);
    return condition ? processContent(ifContent, data) : processContent(elseContent, data);
  });
}

/**
 * Procesa el contenido recursivamente
 */
function processContent(content, data) {
  if (!content) return '';
  
  // Procesar recursivamente
  let result = content;
  result = processEach(result, data);
  result = processConditionals(result, data);
  result = replaceVariables(result, data);
  
  return result;
}

/**
 * Reemplaza variables simples {{variable}}
 */
function replaceVariables(template, data) {
  const variableRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  
  return template.replace(variableRegex, (match, variable) => {
    const value = getNestedValue(data, variable);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * Obtiene un valor anidado de un objeto usando notación de punto
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Determina si un valor es "verdadero" para condicionales
 */
function isTruthy(value) {
  if (value === undefined || value === null) return false;
  if (value === false || value === 0 || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Valida que todas las variables requeridas estén presentes en los datos
 */
function validateTemplateData(requiredVariables, data) {
  const missing = [];
  
  for (const variable of requiredVariables) {
    const value = getNestedValue(data, variable);
    if (value === undefined || value === null) {
      missing.push(variable);
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing
  };
}

/**
 * Obtiene las variables utilizadas en un template
 */
function extractTemplateVariables(template) {
  const variables = new Set();
  
  // Variables simples {{variable}}
  const simpleRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  let match;
  
  while ((match = simpleRegex.exec(template)) !== null) {
    if (!match[1].startsWith('#') && !match[1].startsWith('/')) {
      variables.add(match[1]);
    }
  }
  
  // Variables en condicionales
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}/g;
  while ((match = conditionalRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }
  
  // Variables en comparaciones
  const comparisonRegex = /\{\{#if\s+\(eq\s+(\w+)\s+"[^"]+"\)\}\}/g;
  while ((match = comparisonRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }
  
  // Variables en iteraciones
  const eachRegex = /\{\{#each\s+(\w+)\}\}/g;
  while ((match = eachRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

module.exports = {
  fillTemplate,
  validateTemplateData,
  extractTemplateVariables
};