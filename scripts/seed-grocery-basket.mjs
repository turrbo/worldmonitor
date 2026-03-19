#!/usr/bin/env node

import { loadEnvFile, loadSharedConfig, CHROME_UA, runSeed, sleep } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const config = loadSharedConfig('grocery-basket.json');

const CANONICAL_KEY = 'economic:grocery-basket:v1';
const CACHE_TTL = 21600; // 6h
const EXA_DELAY_MS = 150;

// Hardcoded FX fallbacks for pegged/stable currencies
const FX_FALLBACKS = {
  AED: 0.2723,
  SAR: 0.2666,
  QAR: 0.2747,
  KWD: 3.2520,
  BHD: 2.6525,
  OMR: 2.5974,
  JOD: 1.4104,
  EGP: 0.0204,
  LBP: 0.0000112,
};

async function fetchFxRates() {
  const rates = {};
  for (const [currency, symbol] of Object.entries(config.fxSymbols)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) {
        rates[currency] = FX_FALLBACKS[currency] || null;
        continue;
      }
      const data = await resp.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      rates[currency] = price || FX_FALLBACKS[currency] || null;
    } catch {
      rates[currency] = FX_FALLBACKS[currency] || null;
    }
    await sleep(100);
  }
  console.log('  FX rates fetched:', JSON.stringify(rates));
  return rates;
}

async function searchExa(query, domains) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY not set');

  const resp = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': CHROME_UA,
    },
    body: JSON.stringify({
      query,
      includeDomains: domains,
      numResults: 3,
      type: 'auto',
      summary: {
        query: 'Extract the product price as a number and currency',
        schema: {
          productName: 'string',
          price: 'number',
          currency: 'string',
          brand: 'string',
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.warn(`  EXA ${resp.status}: ${text.slice(0, 100)}`);
    return null;
  }
  return resp.json();
}

function extractPrice(result) {
  // Try structured summary first
  const summary = result?.summary;
  if (summary) {
    try {
      const parsed = typeof summary === 'string' ? JSON.parse(summary) : summary;
      if (parsed?.price && typeof parsed.price === 'number' && parsed.price > 0) {
        return { price: parsed.price, source: result.url || '' };
      }
    } catch {}
  }

  // Regex fallback on title/snippet
  const text = `${result.title || ''} ${result.snippet || ''}`;
  const patterns = [
    /(\d+(?:\.\d{1,3})?)\s*(?:AED|SAR|QAR|KWD|BHD|OMR|EGP|JOD|LBP|USD)/i,
    /(?:AED|SAR|QAR|KWD|BHD|OMR|EGP|JOD|LBP|USD)\s*(\d+(?:\.\d{1,3})?)/i,
    /(\d+(?:\.\d{1,3})?)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parseFloat(match[1]);
      if (price > 0 && price < 100000) {
        return { price, source: result.url || '' };
      }
    }
  }
  return null;
}

async function fetchGroceryBasketPrices() {
  const fxRates = await fetchFxRates();

  const countriesResult = [];

  for (const country of config.countries) {
    console.log(`\n  Processing ${country.flag} ${country.name} (${country.currency})...`);
    const itemPrices = [];
    let totalUsd = 0;
    const fxRate = fxRates[country.currency] || FX_FALLBACKS[country.currency] || null;

    for (const item of config.items) {
      await sleep(EXA_DELAY_MS);

      let localPrice = null;
      let sourceSite = '';

      try {
        const query = `${item.query} ${country.name}`;
        const exaResult = await searchExa(query, country.sites);

        if (exaResult?.results?.length) {
          for (const result of exaResult.results) {
            const extracted = extractPrice(result);
            if (extracted) {
              localPrice = extracted.price;
              sourceSite = extracted.source;
              break;
            }
          }
        }
      } catch (err) {
        console.warn(`    [${country.code}/${item.id}] EXA error: ${err.message}`);
      }

      const usdPrice = localPrice !== null && fxRate ? +(localPrice * fxRate).toFixed(4) : null;
      if (usdPrice !== null) totalUsd += usdPrice;

      itemPrices.push({
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        localPrice: localPrice !== null ? +localPrice.toFixed(4) : null,
        usdPrice: usdPrice,
        currency: country.currency,
        sourceSite,
        available: localPrice !== null,
      });

      const status = localPrice !== null ? `${localPrice} ${country.currency} = $${usdPrice}` : 'N/A';
      console.log(`    ${item.id}: ${status}`);
    }

    countriesResult.push({
      code: country.code,
      name: country.name,
      currency: country.currency,
      flag: country.flag,
      totalUsd: +totalUsd.toFixed(2),
      fxRate: fxRate || 0,
      items: itemPrices,
    });
  }

  // Determine cheapest/most expensive
  const withData = countriesResult.filter(c => c.totalUsd > 0);
  const cheapest = withData.length ? withData.reduce((a, b) => a.totalUsd < b.totalUsd ? a : b).code : '';
  const mostExpensive = withData.length ? withData.reduce((a, b) => a.totalUsd > b.totalUsd ? a : b).code : '';

  return {
    countries: countriesResult,
    fetchedAt: new Date().toISOString(),
    cheapestCountry: cheapest,
    mostExpensiveCountry: mostExpensive,
  };
}

await runSeed('economic', 'grocery-basket', CANONICAL_KEY, fetchGroceryBasketPrices, {
  ttlSeconds: CACHE_TTL,
  validateFn: (data) => data?.countries?.length > 0,
  recordCount: (data) => data?.countries?.length || 0,
});
