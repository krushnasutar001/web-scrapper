const cheerio = require('cheerio');

class ProfileParser {
  constructor() {
    this.selectors = {
      // Basic profile info
      fullName: 'h1.text-heading-xlarge, .pv-text-details__left-panel h1, .ph5 h1',
      headline: '.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium, .ph5 .text-body-medium',
      about: '.pv-about-section .pv-about__summary-text, .about-section .pv-about__summary-text, [data-section="summary"] .pv-about__summary-text',
      location: '.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small, .ph5 .text-body-small',
      
      // Contact info
      contactInfo: '.pv-contact-info__contact-type, .ci-vanity-url, .ci-email, .ci-phone',
      
      // Experience section
      experience: '.pv-profile-section.experience-section .pv-entity__summary-info, .experience .pv-entity__summary-info, [data-section="experience"] .pv-entity__summary-info',
      
      // Education section
      education: '.pv-profile-section.education-section .pv-entity__summary-info, .education .pv-entity__summary-info, [data-section="education"] .pv-entity__summary-info',
      
      // Skills section
      skills: '.pv-skill-category-entity__name, .pv-skill-entity__skill-name, [data-section="skills"] .pv-skill-entity__skill-name',
      
      // Licenses & Certifications
      licenses: '.pv-profile-section.licenses-section .pv-entity__summary-info, .licenses .pv-entity__summary-info, [data-section="licenses"] .pv-entity__summary-info'
    };
  }

  async parse(htmlContent, profileUrl) {
    const $ = cheerio.load(htmlContent);
    
    try {
      const profileData = {
        profileUrl: profileUrl,
        fullName: this.extractFullName($),
        firstName: null,
        lastName: null,
        headline: this.extractHeadline($),
        about: this.extractAbout($),
        lastActivity: this.extractLastActivity($),
        country: null,
        city: null,
        industry: this.extractIndustry($),
        email: null,
        phone: null,
        website: null,
        currentJob: this.extractCurrentJob($),
        skills: this.extractSkills($),
        education: this.extractEducation($),
        experience: this.extractExperience($),
        licensesCertificates: this.extractLicensesCertificates($)
      };
      
      // Parse name into first/last
      if (profileData.fullName) {
        const nameParts = profileData.fullName.trim().split(' ');
        profileData.firstName = nameParts[0] || null;
        profileData.lastName = nameParts.slice(1).join(' ') || null;
      }
      
      // Parse location into country/city
      const location = this.extractLocation($);
      if (location) {
        const locationParts = location.split(',').map(part => part.trim());
        if (locationParts.length >= 2) {
          profileData.city = locationParts[0];
          profileData.country = locationParts[locationParts.length - 1];
        } else {
          profileData.city = location;
        }
      }
      
      // Extract contact info
      const contactInfo = this.extractContactInfo($);
      profileData.email = contactInfo.email;
      profileData.phone = contactInfo.phone;
      profileData.website = contactInfo.website;
      
      return profileData;
      
    } catch (error) {
      console.error('❌ Error parsing profile:', error.message);
      throw new Error(`Profile parsing failed: ${error.message}`);
    }
  }

  extractFullName($) {
    const selectors = [
      'h1.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      '.ph5 h1',
      'h1[data-anonymize="person-name"]',
      '.pv-top-card--list li:first-child h1'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  extractHeadline($) {
    const selectors = [
      '.text-body-medium.break-words',
      '.pv-text-details__left-panel .text-body-medium',
      '.ph5 .text-body-medium',
      '.pv-top-card--list .text-body-medium',
      '[data-anonymize="headline"]'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  extractAbout($) {
    const selectors = [
      '.pv-about-section .pv-about__summary-text',
      '.about-section .pv-about__summary-text',
      '[data-section="summary"] .pv-about__summary-text',
      '.pv-about__summary-text .inline-show-more-text',
      '.about .inline-show-more-text'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  extractLocation($) {
    const selectors = [
      '.text-body-small.inline.t-black--light.break-words',
      '.pv-text-details__left-panel .text-body-small',
      '.ph5 .text-body-small',
      '.pv-top-card--list .text-body-small',
      '[data-anonymize="location"]'
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
      '.pv-text-details__left-panel .text-body-small:contains("industry")',
      '.industry',
      '[data-field="industry"]'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  extractLastActivity($) {
    const selectors = [
      '.pv-recent-activity-section__summary',
      '.recent-activity .pv-recent-activity-section__summary',
      '[data-section="recent-activity"] .pv-recent-activity-section__summary'
    ];
    
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  extractContactInfo($) {
    const contactInfo = {
      email: null,
      phone: null,
      website: null
    };
    
    // Look for contact info section
    const contactSelectors = [
      '.pv-contact-info__contact-type',
      '.ci-vanity-url',
      '.ci-email',
      '.ci-phone'
    ];
    
    contactSelectors.forEach(selector => {
      $(selector).each((i, element) => {
        const text = $(element).text().trim();
        const href = $(element).attr('href') || '';
        
        // Email detection
        if (text.includes('@') || href.includes('mailto:')) {
          contactInfo.email = text.includes('@') ? text : href.replace('mailto:', '');
        }
        
        // Phone detection
        if (text.match(/[\d\s\-\+\(\)]{10,}/) || href.includes('tel:')) {
          contactInfo.phone = text.match(/[\d\s\-\+\(\)]{10,}/) ? text : href.replace('tel:', '');
        }
        
        // Website detection
        if (href.includes('http') && !href.includes('linkedin.com')) {
          contactInfo.website = href;
        }
      });
    });
    
    return contactInfo;
  }

  extractCurrentJob($) {
    const experienceSelectors = [
      '.pv-profile-section.experience-section .pv-entity__summary-info:first-child',
      '.experience .pv-entity__summary-info:first-child',
      '[data-section="experience"] .pv-entity__summary-info:first-child',
      '.pv-entity__summary-info:first-child'
    ];
    
    for (const selector of experienceSelectors) {
      const element = $(selector).first();
      if (element.length) {
        const job = {
          title: null,
          company: null,
          companyUrl: null,
          startDate: null,
          endDate: null,
          location: null,
          type: null,
          description: null
        };
        
        // Extract job title
        const titleElement = element.find('h3, .pv-entity__summary-info-v2 h3, .t-16').first();
        if (titleElement.length) {
          job.title = titleElement.text().trim();
        }
        
        // Extract company name and URL
        const companyElement = element.find('.pv-entity__secondary-title, h4, .t-14').first();
        if (companyElement.length) {
          job.company = companyElement.text().trim();
          
          // Look for company URL
          const companyLink = companyElement.find('a').first();
          if (companyLink.length) {
            job.companyUrl = companyLink.attr('href');
            if (job.companyUrl && job.companyUrl.includes('/company/')) {
              // Clean up LinkedIn company URL
              job.companyUrl = job.companyUrl.split('?')[0]; // Remove query params
            }
          }
        }
        
        // Extract dates
        const dateElement = element.find('.pv-entity__date-range, .t-14.t-black--light, .t-black--light').first();
        if (dateElement.length) {
          const dateText = dateElement.text().trim();
          const dateParts = dateText.split('–').map(part => part.trim());
          
          if (dateParts.length >= 1) {
            job.startDate = dateParts[0];
          }
          if (dateParts.length >= 2 && dateParts[1] !== 'Present') {
            job.endDate = dateParts[1];
          }
        }
        
        // Extract location
        const locationElement = element.find('.pv-entity__location, .t-14.t-black--light:contains(",")').first();
        if (locationElement.length) {
          job.location = locationElement.text().trim();
        }
        
        // Extract description
        const descriptionElement = element.find('.pv-entity__description, .inline-show-more-text').first();
        if (descriptionElement.length) {
          job.description = descriptionElement.text().trim();
        }
        
        return job;
      }
    }
    
    return null;
  }

  extractExperience($) {
    const experience = [];
    
    const experienceSelectors = [
      '.pv-profile-section.experience-section .pv-entity__summary-info',
      '.experience .pv-entity__summary-info',
      '[data-section="experience"] .pv-entity__summary-info'
    ];
    
    for (const selector of experienceSelectors) {
      $(selector).each((i, element) => {
        const job = {
          title: null,
          company: null,
          startDate: null,
          endDate: null,
          location: null,
          description: null
        };
        
        // Extract job title
        const titleElement = $(element).find('h3, .t-16').first();
        if (titleElement.length) {
          job.title = titleElement.text().trim();
        }
        
        // Extract company
        const companyElement = $(element).find('.pv-entity__secondary-title, h4, .t-14').first();
        if (companyElement.length) {
          job.company = companyElement.text().trim();
        }
        
        // Extract dates
        const dateElement = $(element).find('.pv-entity__date-range, .t-black--light').first();
        if (dateElement.length) {
          const dateText = dateElement.text().trim();
          const dateParts = dateText.split('–').map(part => part.trim());
          
          if (dateParts.length >= 1) {
            job.startDate = dateParts[0];
          }
          if (dateParts.length >= 2 && dateParts[1] !== 'Present') {
            job.endDate = dateParts[1];
          }
        }
        
        // Extract location
        const locationElement = $(element).find('.pv-entity__location').first();
        if (locationElement.length) {
          job.location = locationElement.text().trim();
        }
        
        // Extract description
        const descriptionElement = $(element).find('.pv-entity__description, .inline-show-more-text').first();
        if (descriptionElement.length) {
          job.description = descriptionElement.text().trim();
        }
        
        if (job.title || job.company) {
          experience.push(job);
        }
      });
      
      if (experience.length > 0) break;
    }
    
    return experience;
  }

  extractEducation($) {
    const education = [];
    
    const educationSelectors = [
      '.pv-profile-section.education-section .pv-entity__summary-info',
      '.education .pv-entity__summary-info',
      '[data-section="education"] .pv-entity__summary-info'
    ];
    
    for (const selector of educationSelectors) {
      $(selector).each((i, element) => {
        const edu = {
          school: null,
          degree: null,
          field: null,
          startDate: null,
          endDate: null
        };
        
        // Extract school name
        const schoolElement = $(element).find('h3, .t-16').first();
        if (schoolElement.length) {
          edu.school = schoolElement.text().trim();
        }
        
        // Extract degree and field
        const degreeElement = $(element).find('.pv-entity__degree-name, .pv-entity__secondary-title, .t-14').first();
        if (degreeElement.length) {
          const degreeText = degreeElement.text().trim();
          if (degreeText.includes(',')) {
            const parts = degreeText.split(',').map(part => part.trim());
            edu.degree = parts[0];
            edu.field = parts[1];
          } else {
            edu.degree = degreeText;
          }
        }
        
        // Extract dates
        const dateElement = $(element).find('.pv-entity__dates, .t-black--light').first();
        if (dateElement.length) {
          const dateText = dateElement.text().trim();
          const dateParts = dateText.split('–').map(part => part.trim());
          
          if (dateParts.length >= 1) {
            edu.startDate = dateParts[0];
          }
          if (dateParts.length >= 2) {
            edu.endDate = dateParts[1];
          }
        }
        
        if (edu.school || edu.degree) {
          education.push(edu);
        }
      });
      
      if (education.length > 0) break;
    }
    
    return education;
  }

  extractSkills($) {
    const skills = [];
    
    const skillSelectors = [
      '.pv-skill-category-entity__name',
      '.pv-skill-entity__skill-name',
      '[data-section="skills"] .pv-skill-entity__skill-name',
      '.skill-category-entity__name'
    ];
    
    for (const selector of skillSelectors) {
      $(selector).each((i, element) => {
        const skillText = $(element).text().trim();
        if (skillText && !skills.includes(skillText)) {
          skills.push(skillText);
        }
      });
      
      if (skills.length > 0) break;
    }
    
    return skills;
  }

  extractLicensesCertificates($) {
    const licenses = [];
    
    const licenseSelectors = [
      '.pv-profile-section.licenses-section .pv-entity__summary-info',
      '.licenses .pv-entity__summary-info',
      '[data-section="licenses"] .pv-entity__summary-info'
    ];
    
    for (const selector of licenseSelectors) {
      $(selector).each((i, element) => {
        const license = {
          name: null,
          issuer: null,
          issueDate: null,
          expirationDate: null,
          credentialId: null
        };
        
        // Extract license name
        const nameElement = $(element).find('h3, .t-16').first();
        if (nameElement.length) {
          license.name = nameElement.text().trim();
        }
        
        // Extract issuer
        const issuerElement = $(element).find('.pv-entity__secondary-title, .t-14').first();
        if (issuerElement.length) {
          license.issuer = issuerElement.text().trim();
        }
        
        // Extract dates
        const dateElement = $(element).find('.pv-entity__date-range, .t-black--light').first();
        if (dateElement.length) {
          const dateText = dateElement.text().trim();
          if (dateText.includes('–')) {
            const dateParts = dateText.split('–').map(part => part.trim());
            license.issueDate = dateParts[0];
            license.expirationDate = dateParts[1];
          } else {
            license.issueDate = dateText;
          }
        }
        
        // Extract credential ID
        const credentialElement = $(element).find('.pv-entity__credential-id').first();
        if (credentialElement.length) {
          license.credentialId = credentialElement.text().trim().replace('Credential ID: ', '');
        }
        
        if (license.name || license.issuer) {
          licenses.push(license);
        }
      });
      
      if (licenses.length > 0) break;
    }
    
    return licenses;
  }
}

module.exports = ProfileParser;