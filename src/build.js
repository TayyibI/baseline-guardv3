#!/usr/bin/env node
/**
 * Build script to fetch web-features data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function fetchWebFeatures() {
  console.log('📦 Fetching web-features data...');
  
  try {
    // Fetch from the official MDN baseline data
    const response = await fetch('https://raw.githubusercontent.com/mdn/baseline/main/data/data.json');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Create the directory structure
    const distDir = path.join(projectRoot, 'dist', 'web-features');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    // Transform the data to match our expected format
    const transformedData = {
      features: data,
      metadata: {
        source: "MDN Baseline Data",
        fetched: new Date().toISOString(),
        url: "https://github.com/mdn/baseline"
      }
    };
    
    // Write the data file
    const dataPath = path.join(distDir, 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify(transformedData, null, 2));
    
    console.log('✅ Web features data downloaded successfully!');
    console.log(`📁 Data saved to: ${dataPath}`);
    
  } catch (error) {
    console.error('❌ Failed to fetch web features data:', error.message);
    
    // Create a fallback minimal dataset
    console.log('🔄 Creating fallback dataset...');
    createFallbackData();
  }
}

function createFallbackData() {
  const distDir = path.join(projectRoot, 'dist', 'web-features');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  const fallbackData = {
    features: {
      // Common web features with baseline status
      'fetch': {
        "name": "fetch",
        "title": "Fetch API",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      },
      'promise': {
        "name": "promise",
        "title": "Promise",
        "status": {
          "baseline": "high", 
          "baseline_high_date": "2017-03-07"
        }
      },
      'arrow-function': {
        "name": "arrow-function",
        "title": "Arrow Functions",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      },
      'css-grid': {
        "name": "css-grid",
        "title": "CSS Grid",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      },
      'flexbox': {
        "name": "flexbox", 
        "title": "CSS Flexbox",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      },
      'async-function': {
        "name": "async-function",
        "title": "Async Functions",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      },
      'const': {
        "name": "const",
        "title": "const declaration",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      },
      'let': {
        "name": "let", 
        "title": "let declaration",
        "status": {
          "baseline": "high",
          "baseline_high_date": "2017-03-07"
        }
      }
    },
    metadata: {
      source: "Fallback Dataset",
      created: new Date().toISOString(),
      note: "This is a minimal fallback dataset. For complete data, ensure internet access during build."
    }
  };
  
  const dataPath = path.join(distDir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(fallbackData, null, 2));
  
  console.log('✅ Fallback dataset created!');
  console.log(`📁 Data saved to: ${dataPath}`);
}

// Run the build
fetchWebFeatures();