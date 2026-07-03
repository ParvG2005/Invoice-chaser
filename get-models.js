fetch('https://openrouter.ai/api/v1/models')
  .then(res => res.json())
  .then(data => {
    const freeModels = data.data.filter(m => m.id.endsWith(':free') || (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0')).map(m => m.id);
    console.log(freeModels.join('\n'));
  })
  .catch(console.error);
