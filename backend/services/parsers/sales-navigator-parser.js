const cheerio = require('cheerio');

class SalesNavigatorParser {
  constructor() {
    this.selectors = {
      // Sales Navigator search result selectors
      resultCards: '.artdeco-entity-lockup, .search-results__result-item, .result-lockup, .search-result',
      profileName: '.artdeco-entity-lockup__title, .result-lockup__name, .search-result__info .name',
      profileHeadline: '.artdeco-entity-lockup__subtitle, .result-lockup__highlight-keyword, .search-result__info .headline',
      currentTitle: '.artdeco-entity-lockup__metadata, .result-lockup__position-list, .search-result__info .title',
      currentCompany: '.artdeco-entity-lockup__metadata, .result-lockup__position-list, .search-result__info .company',
      location: '.artdeco-entity-lockup__metadata, .result-lockup__misc-item, .search-result__info .location',
      industry: '.artdeco-entity-lockup__metadata, .result-lockup__misc-item, .search-result__info .industry',
      profileUrl: 'a[href*="/lead/"], a[href*="/in/"], .result-lockup__name a'
    };
  }

  async parse(htmlContent, searchUrl) {
    const $ = cheerio.load(htmlContent);
    
    try {
      const results = [];
      
      // Find all result cards
      const resultSelectors = [
        '.artdeco-entity-lockup',
        '.search-results__result-item',
        '.result-lockup',
        '.search-result',
        '.search-results-container .search-result'
      ];
      
      let foundResults = false;
      
      for (const selector of resultSelectors) {
        const resultCards = $(selector);
        
        if (resultCards.length > 0) {
          console.log(`📋 Found ${resultCards.length} results using selector: ${selector}`);
          foundResults = true;
          
          resultCards.each((index, element) => {
            const result = this.parseResultCard($, $(element), searchUrl);
            if (result && result.fullName) {
              results.push(result);
            }
          });
          
          break; // Use the first selector that finds results
        }
      }
      
      if (!foundResults) {
        console.log('⚠️ No results found with standard selectors, trying alternative parsing');
        // Try alternative parsing methods
        const alternativeResults = this.parseAlternativeFormat($, searchUrl);
        results.push(...alternativeResults);
      }
      
      console.log(`✅ Parsed ${results.length} search results`);
      return results;
      
    } catch (error) {
      console.error('❌ Error parsing Sales Navigator results:', error.message);
      throw new Error(`Sales Navigator parsing failed: ${error.message}`);
    }
  }

  parseResultCard($, cardElement, searchUrl) {
    const result = {
      searchUrl: searchUrl,
      profileUrl: null,
      fullName: null,
      headline: null,
      currentTitle: null,
      currentCompany: null,
      location: null,
      industry: null
    };
    
    try {
      // Extract profile URL
      result.profileUrl = this.extractProfileUrl($, cardElement);
      
      // Extract full name
      result.fullName = this.extractFullName($, cardElement);
      
      // Extract headline
      result.headline = this.extractHeadline($, cardElement);
      
      // Extract current title and company
      const titleCompany = this.extractTitleAndCompany($, cardElement);
      result.currentTitle = titleCompany.title;
      result.currentCompany = titleCompany.company;
      
      // Extract location
      result.location = this.extractLocation($, cardElement);
      
      // Extract industry
      result.industry = this.extractIndustry($, cardElement);
      
      return result;
      
    } catch (error) {
      console.error('❌ Error parsing result card:', error.message);
      return null;
    }
  }

  extractProfileUrl($, cardElement) {
    const linkSelectors = [
      'a[href*="/lead/"]',
      'a[href*="/in/"]',
      '.result-lockup__name a',
      '.artdeco-entity-lockup__title a',
      'a[data-control-name="search_srp_result"]'
    ];
    
    for (const selector of linkSelectors) {
      const linkElement = cardElement.find(selector).first();
      if (linkElement.length) {
        let href = linkElement.attr('href');
        if (href) {
          // Convert Sales Navigator lead URL to regular LinkedIn profile URL
          if (href.includes('/lead/')) {
            // Extract profile identifier from lead URL
            const leadMatch = href.match(/\/lead\/([^,]+),/);
            if (leadMatch) {
              const profileId = leadMatch[1];
              href = `https://www.linkedin.com/in/${profileId}/`;
            }
          } else if (href.startsWith('/')) {
            href = 'https://www.linkedin.com' + href;
          }
          
          // Clean up URL
          href = href.split('?')[0]; // Remove query parameters
          return href;
        }
      }
    }
    
    return null;
  }

  extractFullName($, cardElement) {
    const nameSelectors = [
      '.artdeco-entity-lockup__title a',
      '.result-lockup__name a',
      '.search-result__info .name',
      '.artdeco-entity-lockup__title',
      '.result-lockup__name',
      'h3 a',
      '.name a'
    ];
    
    for (const selector of nameSelectors) {
      const nameElement = cardElement.find(selector).first();
      if (nameElement.length && nameElement.text().trim()) {
        return nameElement.text().trim();
      }
    }
    
    return null;
  }

  extractHeadline($, cardElement) {
    const headlineSelectors = [
      '.artdeco-entity-lockup__subtitle',
      '.result-lockup__highlight-keyword',
      '.search-result__info .headline',
      '.artdeco-entity-lockup__caption',
      '.result-lockup__subtitle'
    ];
    
    for (const selector of headlineSelectors) {
      const headlineElement = cardElement.find(selector).first();
      if (headlineElement.length && headlineElement.text().trim()) {
        return headlineElement.text().trim();
      }
    }
    
    return null;
  }

  extractTitleAndCompany($, cardElement) {
    const titleCompany = {
      title: null,
      company: null
    };
    
    const titleCompanySelectors = [
      '.artdeco-entity-lockup__metadata',
      '.result-lockup__position-list',
      '.search-result__info .title-company',
      '.artdeco-entity-lockup__content .t-14'
    ];
    
    for (const selector of titleCompanySelectors) {
      const elements = cardElement.find(selector);
      
      elements.each((i, element) => {
        const text = $(element).text().trim();
        
        // Look for patterns like "Title at Company" or "Title • Company"
        if (text.includes(' at ')) {
          const parts = text.split(' at ');
          if (parts.length >= 2) {
            titleCompany.title = parts[0].trim();
            titleCompany.company = parts.slice(1).join(' at ').trim();
            return false; // Break out of each loop
          }
        } else if (text.includes(' • ')) {
          const parts = text.split(' • ');
          if (parts.length >= 2) {
            titleCompany.title = parts[0].trim();
            titleCompany.company = parts[1].trim();
            return false; // Break out of each loop
          }
        } else if (text.includes(' - ')) {
          const parts = text.split(' - ');
          if (parts.length >= 2) {
            titleCompany.title = parts[0].trim();
            titleCompany.company = parts[1].trim();
            return false; // Break out of each loop
          }
        }
      });
      
      if (titleCompany.title || titleCompany.company) {
        break;
      }
    }
    
    // If we didn't find title/company in combined format, try separate selectors
    if (!titleCompany.title && !titleCompany.company) {
      // Try to find title separately
      const titleSelectors = [
        '.result-lockup__position-list .t-14:first-child',
        '.artdeco-entity-lockup__metadata .t-14:first-child',
        '.current-position .title'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = cardElement.find(selector).first();
        if (titleElement.length && titleElement.text().trim()) {
          titleCompany.title = titleElement.text().trim();
          break;
        }
      }
      
      // Try to find company separately
      const companySelectors = [
        '.result-lockup__position-list .t-14:last-child',
        '.artdeco-entity-lockup__metadata .t-14:last-child',
        '.current-position .company'
      ];
      
      for (const selector of companySelectors) {
        const companyElement = cardElement.find(selector).first();
        if (companyElement.length && companyElement.text().trim()) {
          const companyText = companyElement.text().trim();
          // Skip if it's the same as title (avoid duplication)
          if (companyText !== titleCompany.title) {
            titleCompany.company = companyText;
            break;
          }
        }
      }
    }
    
    return titleCompany;
  }

  extractLocation($, cardElement) {
    const locationSelectors = [
      '.artdeco-entity-lockup__metadata .t-black--light:contains("area")',
      '.result-lockup__misc-item:contains("area")',
      '.search-result__info .location',
      '.artdeco-entity-lockup__metadata .t-12',
      '.result-lockup__misc-item'
    ];
    
    for (const selector of locationSelectors) {
      const locationElements = cardElement.find(selector);
      
      locationElements.each((i, element) => {
        const text = $(element).text().trim();
        
        // Look for location patterns (contains city/country names or "area")
        if (text.includes('area') || text.includes(',') || 
            text.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/) || // City State pattern
            text.match(/^[A-Z][a-z]+,\s*[A-Z][a-z]+$/)) { // City, Country pattern
          return text;
        }
      });
    }
    
    return null;
  }

  extractIndustry($, cardElement) {
    const industrySelectors = [
      '.artdeco-entity-lockup__metadata .t-black--light:not(:contains("area"))',
      '.result-lockup__misc-item:not(:contains("area"))',
      '.search-result__info .industry',
      '.industry'
    ];
    
    for (const selector of industrySelectors) {
      const industryElements = cardElement.find(selector);
      
      industryElements.each((i, element) => {
        const text = $(element).text().trim();
        
        // Skip location-like text
        if (!text.includes('area') && !text.includes(',') && 
            !text.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+$/) &&
            text.length > 3) {
          return text;
        }
      });
    }
    
    return null;
  }

  parseAlternativeFormat($, searchUrl) {
    const results = [];
    
    // Try to find any elements that might contain profile information
    const possibleContainers = [
      '.search-results li',
      '.search-result-container',
      '.people-search-result',
      '.entity-result',
      '[data-test-search-result]'
    ];
    
    for (const containerSelector of possibleContainers) {
      const containers = $(containerSelector);
      
      if (containers.length > 0) {
        console.log(`🔍 Trying alternative parsing with ${containers.length} containers`);
        
        containers.each((index, element) => {
          const container = $(element);
          
          // Look for any links that might be profile URLs
          const profileLinks = container.find('a[href*="/in/"], a[href*="/lead/"]');
          
          if (profileLinks.length > 0) {
            const result = {
              searchUrl: searchUrl,
              profileUrl: null,
              fullName: null,
              headline: null,
              currentTitle: null,
              currentCompany: null,
              location: null,
              industry: null
            };
            
            // Extract profile URL
            const firstLink = profileLinks.first();
            let href = firstLink.attr('href');
            if (href) {
              if (href.includes('/lead/')) {
                const leadMatch = href.match(/\/lead\/([^,]+),/);
                if (leadMatch) {
                  href = `https://www.linkedin.com/in/${leadMatch[1]}/`;
                }
              } else if (href.startsWith('/')) {
                href = 'https://www.linkedin.com' + href;
              }
              result.profileUrl = href.split('?')[0];
            }
            
            // Extract name (usually the link text or nearby)
            result.fullName = firstLink.text().trim() || 
                            container.find('h3, .name, [data-anonymize="person-name"]').first().text().trim();
            
            // Extract other information from container
            const allText = container.text();
            const textLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            
            // Try to identify headline, title, company from text patterns
            for (const line of textLines) {
              if (line.includes(' at ') && !result.currentTitle) {
                const parts = line.split(' at ');
                result.currentTitle = parts[0].trim();
                result.currentCompany = parts[1].trim();
              } else if (line.includes(' • ') && !result.currentTitle) {
                const parts = line.split(' • ');
                result.currentTitle = parts[0].trim();
                result.currentCompany = parts[1].trim();
              } else if (line.includes(',') && !result.location) {
                // Might be location
                result.location = line;
              }
            }
            
            if (result.fullName && result.profileUrl) {
              results.push(result);
            }
          }
        });
        
        if (results.length > 0) {
          break;
        }
      }
    }
    
    return results;
  }
}

module.exports = SalesNavigatorParser;