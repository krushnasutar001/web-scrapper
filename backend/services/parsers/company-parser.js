const cheerio = require('cheerio');

class CompanyParser {
  constructor() {
    this.selectors = {
      // Basic company info
      companyName: 'h1.org-top-card-summary__title, .org-top-card-summary__title, h1[data-anonymize="company-name"]',
      industry: '.org-top-card-summary__industry, .org-page-details__definition-text',
      headquarters: '.org-top-card-summary__headquarter, .org-page-details__definition-text',
      followers: '.org-top-card-summary__follower-count, .follower-count',
      employeeSize: '.org-top-card-summary__employee-count, .org-page-details__definition-text',
      website: '.org-top-card-summary__website, .link-without-visited-state',
      companyType: '.org-page-details__definition-text',
      specialties: '.org-page-details__definition-text, .org-about-us__specialties'
    };
  }

  async parse(htmlContent, companyUrl) {
    const $ = cheerio.load(htmlContent);
    
    try {
      const companyData = {
        companyUrl: companyUrl,
        companyId: this.extractCompanyId(companyUrl),
        companyName: this.extractCompanyName($),
        industry: this.extractIndustry($),
        headquarters: this.extractHeadquarters($),
        followers: this.extractFollowers($),
        employeeSize: this.extractEmployeeSize($),
        website: this.extractWebsite($),
        companyType: this.extractCompanyType($),
        specialties: this.extractSpecialties($),
        associatedMembers: this.extractAssociatedMembers($)
      };
      
      return companyData;
      
    } catch (error) {
      console.error('❌ Error parsing company:', error.message);
      throw new Error(`Company parsing failed: ${error.message}`);
    }
  }

  extractCompanyId(companyUrl) {
    // Extract company ID from URL
    const match = companyUrl.match(/\/company\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  extractCompanyName($) {
    const selectors = [
      'h1.org-top-card-summary__title',
      '.org-top-card-summary__title',
      'h1[data-anonymize="company-name"]',
      '.org-top-card-summary-info-list__info-item h1',
      '.org-top-card-summary__info h1'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  extractIndustry($) {
    const selectors = [
      '.org-top-card-summary__industry',
      '.org-page-details__definition-text:contains("Industry")',
      '.org-about-company-module__company-details .text-color-text',
      '.org-top-card-summary-info-list__info-item:contains("Industry") + .org-top-card-summary-info-list__info-item'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        let text = element.text().trim();
        // Clean up if it contains "Industry" label
        text = text.replace(/^Industry\s*:?\s*/i, '');
        if (text) return text;
      }
    }
    
    // Try to find industry in page details section
    $('.org-page-details__definition-term').each((i, element) => {
      const term = $(element).text().trim().toLowerCase();
      if (term.includes('industry')) {
        const definition = $(element).next('.org-page-details__definition-text');
        if (definition.length) {
          const industryText = definition.text().trim();
          if (industryText) return industryText;
        }
      }
    });
    
    return null;
  }

  extractHeadquarters($) {
    const selectors = [
      '.org-top-card-summary__headquarter',
      '.org-page-details__definition-text:contains("Headquarters")',
      '.org-about-company-module__company-details .text-color-text:contains("Headquarters")',
      '.org-top-card-summary-info-list__info-item:contains("Headquarters") + .org-top-card-summary-info-list__info-item'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        let text = element.text().trim();
        // Clean up if it contains "Headquarters" label
        text = text.replace(/^Headquarters\s*:?\s*/i, '');
        if (text) return text;
      }
    }
    
    // Try to find headquarters in page details section
    $('.org-page-details__definition-term').each((i, element) => {
      const term = $(element).text().trim().toLowerCase();
      if (term.includes('headquarters') || term.includes('location')) {
        const definition = $(element).next('.org-page-details__definition-text');
        if (definition.length) {
          const hqText = definition.text().trim();
          if (hqText) return hqText;
        }
      }
    });
    
    return null;
  }

  extractFollowers($) {
    const selectors = [
      '.org-top-card-summary__follower-count',
      '.follower-count',
      '.org-top-card-summary-info-list__info-item:contains("followers")',
      '.org-about-company-module__company-details:contains("followers")',
      '[data-test-id="follower-count"]'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        let text = element.text().trim();
        // Extract number from text like "1,234 followers"
        const match = text.match(/([\d,]+)\s*followers?/i);
        if (match) {
          return match[1];
        }
        // If it's just a number
        const numberMatch = text.match(/^[\d,]+$/);
        if (numberMatch) {
          return text;
        }
      }
    }
    
    return null;
  }

  extractEmployeeSize($) {
    const selectors = [
      '.org-top-card-summary__employee-count',
      '.org-page-details__definition-text:contains("employees")',
      '.org-about-company-module__company-details:contains("employees")',
      '.org-top-card-summary-info-list__info-item:contains("employees")'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        let text = element.text().trim();
        // Extract employee range like "1,001-5,000 employees"
        const match = text.match(/([\d,]+-[\d,]+|[\d,]+)\s*employees?/i);
        if (match) {
          return match[1];
        }
      }
    }
    
    // Try to find employee size in page details section
    $('.org-page-details__definition-term').each((i, element) => {
      const term = $(element).text().trim().toLowerCase();
      if (term.includes('company size') || term.includes('employees')) {
        const definition = $(element).next('.org-page-details__definition-text');
        if (definition.length) {
          const sizeText = definition.text().trim();
          const match = sizeText.match(/([\d,]+-[\d,]+|[\d,]+)\s*employees?/i);
          if (match) {
            return match[1];
          }
        }
      }
    });
    
    return null;
  }

  extractWebsite($) {
    const selectors = [
      '.org-top-card-summary__website a',
      '.link-without-visited-state[href^="http"]',
      '.org-about-company-module__company-details a[href^="http"]',
      'a[data-test-id="website-url"]'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const href = element.attr('href');
        if (href && href.startsWith('http') && !href.includes('linkedin.com')) {
          return href;
        }
      }
    }
    
    // Try to find website in page details section
    $('.org-page-details__definition-term').each((i, element) => {
      const term = $(element).text().trim().toLowerCase();
      if (term.includes('website')) {
        const definition = $(element).next('.org-page-details__definition-text');
        if (definition.length) {
          const link = definition.find('a').first();
          if (link.length) {
            const href = link.attr('href');
            if (href && href.startsWith('http') && !href.includes('linkedin.com')) {
              return href;
            }
          }
        }
      }
    });
    
    return null;
  }

  extractCompanyType($) {
    const selectors = [
      '.org-page-details__definition-text:contains("Type")',
      '.org-about-company-module__company-details:contains("Type")',
      '.org-top-card-summary-info-list__info-item:contains("Type")'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        let text = element.text().trim();
        // Clean up if it contains "Type" label
        text = text.replace(/^Type\s*:?\s*/i, '');
        if (text) return text;
      }
    }
    
    // Try to find company type in page details section
    $('.org-page-details__definition-term').each((i, element) => {
      const term = $(element).text().trim().toLowerCase();
      if (term.includes('type') || term.includes('company type')) {
        const definition = $(element).next('.org-page-details__definition-text');
        if (definition.length) {
          const typeText = definition.text().trim();
          if (typeText) return typeText;
        }
      }
    });
    
    return null;
  }

  extractSpecialties($) {
    const selectors = [
      '.org-about-us__specialties',
      '.org-page-details__definition-text:contains("Specialties")',
      '.org-about-company-module__specialties',
      '.specialties'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        let text = element.text().trim();
        // Clean up if it contains "Specialties" label
        text = text.replace(/^Specialties\s*:?\s*/i, '');
        if (text) return text;
      }
    }
    
    // Try to find specialties in page details section
    $('.org-page-details__definition-term').each((i, element) => {
      const term = $(element).text().trim().toLowerCase();
      if (term.includes('specialties')) {
        const definition = $(element).next('.org-page-details__definition-text');
        if (definition.length) {
          const specialtiesText = definition.text().trim();
          if (specialtiesText) return specialtiesText;
        }
      }
    });
    
    return null;
  }

  extractAssociatedMembers($) {
    const members = [];
    
    const memberSelectors = [
      '.org-people-profile-card__profile-title',
      '.org-people-profile-card',
      '.people-card',
      '.org-people__profile-card'
    ];
    
    for (const selector of memberSelectors) {
      $(selector).each((i, element) => {
        const member = {
          name: null,
          title: null,
          profileUrl: null
        };
        
        // Extract member name
        const nameElement = $(element).find('.org-people-profile-card__profile-title, .people-card__title, h3').first();
        if (nameElement.length) {
          member.name = nameElement.text().trim();
        }
        
        // Extract member title
        const titleElement = $(element).find('.org-people-profile-card__profile-info, .people-card__subtitle, .t-14').first();
        if (titleElement.length) {
          member.title = titleElement.text().trim();
        }
        
        // Extract profile URL
        const linkElement = $(element).find('a[href*="/in/"]').first();
        if (linkElement.length) {
          member.profileUrl = linkElement.attr('href');
          if (member.profileUrl && member.profileUrl.startsWith('/')) {
            member.profileUrl = 'https://www.linkedin.com' + member.profileUrl;
          }
        }
        
        if (member.name || member.title) {
          members.push(member);
        }
      });
      
      if (members.length > 0) break;
    }
    
    // Limit to first 10 members to avoid too much data
    return members.slice(0, 10);
  }
}

module.exports = CompanyParser;