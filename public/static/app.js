/**
 * Frontend JavaScript
 * Funcionalidades progressivas mínimas
 */

(function() {
  'use strict';

  // ============================================================================
  // Lazy Load Images
  // ============================================================================
  
  if ('IntersectionObserver' in window) {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    });
    
    images.forEach(img => imageObserver.observe(img));
  }

  // ============================================================================
  // Newsletter Form
  // ============================================================================
  
  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterForm.querySelector('input[name="email"]').value;
      
      try {
        const response = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert('Obrigado por se inscrever!');
          newsletterForm.reset();
        } else {
          alert('Erro ao inscrever. Tente novamente.');
        }
      } catch (error) {
        alert('Erro ao inscrever. Tente novamente.');
      }
    });
  }

  // ============================================================================
  // Analytics (placeholder)
  // ============================================================================
  
  // Google Analytics ou outro provider pode ser carregado aqui
  // com consentimento do usuário

})();
