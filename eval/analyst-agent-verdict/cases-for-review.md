# Casos para el eval del analyst agent

20 casos — ver eval/analyst-agent-verdict/cases.json para el JSON fuente.

## Resumen

| id | esperado | por qué |
|---|---|---|
| B1_AAPL_clean_buy | BUY | Uptrend + healthy momentum + solid dividend health + unambiguously positive news. Textbook BUY. |
| B2_JNJ_dividend_aristocrat | BUY | 30-year dividend growth streak, healthy payout, uptrend, positive catalyst news. |
| B3_HD_beat_expectations | BUY | Clean uptrend, decent dividend, same-store sales beat — no red flags anywhere. |
| B4_NVDA_growth_no_dividend | BUY | Strong growth stock with no dividend by design (not a red flag) — overwhelming positive technical + news signal. |
| B5_COST_membership_strength | BUY | Low yield but long growth streak and very safe payout; strong operational news. |
| B6_MCD_global_growth | BUY | 47-year dividend growth streak, uptrend, positive global sales news. |
| A1_FRAUDCO_news_overrides_good_scores | AVOID | Technical/dividend scores look fine, but an active fraud investigation is a disqualifying red flag — tests that severe acute news overrides stale quantitative scores. |
| A2_YIELDTRAP_classic | AVOID | Textbook yield trap: huge yield, unsustainable payout ratio, downtrend, oversold, and explicit dividend-cut warning. |
| A3_RETAILCO_bankruptcy_risk | AVOID | Everything points down: deep downtrend, oversold, weak dividend, explicit bankruptcy-risk headline. |
| A4_BIOTECHX_fda_rejection | AVOID | No dividend data is irrelevant here — FDA rejection + going-concern doubts + downtrend is a clear AVOID regardless. |
| A5_ENERGYCO_dividend_suspended | AVOID | News directly contradicts the quantitative yield field (dividend was just suspended) — tests whether the agent trusts stale numbers over the news. |
| A6_BANKX_credit_downgrade | AVOID | Regulatory capital shortfall + junk credit downgrade outweighs a decent dividend history. |
| H1_MIXEDCO_nothing_compelling | HOLD | Mixed trend, mediocre everything, no news — nothing here clears the bar for action either way. |
| H2_OVERBOUGHT_dont_chase | HOLD | Uptrend is real but RSI 82 is deep overbought territory at a new high — chasing here is exactly what a disciplined analyst avoids. |
| H3_NEWCO_no_data_at_all | HOLD | No technical history, no dividend data, no news — the agent must never guess with nothing to go on. |
| H4_SMALLCAP_insufficient_technical_history | HOLD | Dividend metrics look fine, but technical history is too short to confirm any trend — insufficient data on the other axis should still hold the agent back. |
| H5_DIVCUTRISK_good_technicals_income_risk | HOLD o AVOID | Hard case: technicals look good, but a 95% payout ratio plus an explicit dividend-cut warning is real near-term income risk. Conservative calls (HOLD or AVOID) are both acceptable; BUY would not be. |
| H6_CHOPPY_volatile_uncertainty | HOLD | Mixed/oversold with mediocre dividend and a vague volatility headline — no real edge in either direction. |
| H7_PENDING_MERGER_deal_uncertainty | HOLD | Good technicals, but an unconfirmed acquisition creates binary deal-risk a conservative analyst should wait out rather than chase. |
| H8_EARNINGS_TOMORROW_binary_event_risk | HOLD o BUY | Genuinely hard case: everything looks good, but earnings tomorrow is a binary event. Both waiting (HOLD) and trusting the trend (BUY) are defensible — AVOID would not be. |

## Detalle por caso

### B1_AAPL_clean_buy

**Esperado:** BUY  
**Por qué:** Uptrend + healthy momentum + solid dividend health + unambiguously positive news. Textbook BUY.

```json
{
  "symbol": "AAPL",
  "technical": {
    "score": 85,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 58,
    "pctFrom52wLow": 0.32
  },
  "dividend": {
    "score": 78,
    "yieldPct": 2.6,
    "consecutiveGrowthYears": 11,
    "payoutRatioPct": 38,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Apple beats Q3 earnings estimates, raises guidance",
    "Services revenue hits all-time high"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### B2_JNJ_dividend_aristocrat

**Esperado:** BUY  
**Por qué:** 30-year dividend growth streak, healthy payout, uptrend, positive catalyst news.

```json
{
  "symbol": "JNJ",
  "technical": {
    "score": 72,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 54,
    "pctFrom52wLow": 0.18
  },
  "dividend": {
    "score": 92,
    "yieldPct": 3.1,
    "consecutiveGrowthYears": 30,
    "payoutRatioPct": 45,
    "insufficientData": false
  },
  "newsHeadlines": [
    "J&J dividend aristocrat extends 30-year streak",
    "FDA approves new drug"
  ],
  "portfolioContext": "1/5 posiciones abiertas."
}
```

### B3_HD_beat_expectations

**Esperado:** BUY  
**Por qué:** Clean uptrend, decent dividend, same-store sales beat — no red flags anywhere.

```json
{
  "symbol": "HD",
  "technical": {
    "score": 68,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 56,
    "pctFrom52wLow": 0.25
  },
  "dividend": {
    "score": 70,
    "yieldPct": 2.3,
    "consecutiveGrowthYears": 14,
    "payoutRatioPct": 55,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Home Depot same-store sales beat expectations"
  ],
  "portfolioContext": "2/5 posiciones abiertas."
}
```

### B4_NVDA_growth_no_dividend

**Esperado:** BUY  
**Por qué:** Strong growth stock with no dividend by design (not a red flag) — overwhelming positive technical + news signal.

```json
{
  "symbol": "NVDA",
  "technical": {
    "score": 88,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 62,
    "pctFrom52wLow": 0.6
  },
  "dividend": {
    "score": 0,
    "yieldPct": null,
    "consecutiveGrowthYears": null,
    "payoutRatioPct": null,
    "insufficientData": true,
    "reason": "no_dividend_history"
  },
  "newsHeadlines": [
    "NVIDIA announces new AI chip demand surge",
    "Data center revenue triples year over year"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### B5_COST_membership_strength

**Esperado:** BUY  
**Por qué:** Low yield but long growth streak and very safe payout; strong operational news.

```json
{
  "symbol": "COST",
  "technical": {
    "score": 75,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 57,
    "pctFrom52wLow": 0.2
  },
  "dividend": {
    "score": 65,
    "yieldPct": 0.8,
    "consecutiveGrowthYears": 20,
    "payoutRatioPct": 28,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Costco membership renewal rate hits record high"
  ],
  "portfolioContext": "3/5 posiciones abiertas."
}
```

### B6_MCD_global_growth

**Esperado:** BUY  
**Por qué:** 47-year dividend growth streak, uptrend, positive global sales news.

```json
{
  "symbol": "MCD",
  "technical": {
    "score": 70,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 55,
    "pctFrom52wLow": 0.22
  },
  "dividend": {
    "score": 80,
    "yieldPct": 2.1,
    "consecutiveGrowthYears": 47,
    "payoutRatioPct": 58,
    "insufficientData": false
  },
  "newsHeadlines": [
    "McDonald's same-store sales grow globally"
  ],
  "portfolioContext": "1/5 posiciones abiertas."
}
```

### A1_FRAUDCO_news_overrides_good_scores

**Esperado:** AVOID  
**Por qué:** Technical/dividend scores look fine, but an active fraud investigation is a disqualifying red flag — tests that severe acute news overrides stale quantitative scores.

```json
{
  "symbol": "FRAUDCO",
  "technical": {
    "score": 60,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 55,
    "pctFrom52wLow": 0.4
  },
  "dividend": {
    "score": 70,
    "yieldPct": 2.5,
    "consecutiveGrowthYears": 8,
    "payoutRatioPct": 40,
    "insufficientData": false
  },
  "newsHeadlines": [
    "SEC opens formal investigation into accounting practices",
    "CFO resigns abruptly amid fraud allegations"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### A2_YIELDTRAP_classic

**Esperado:** AVOID  
**Por qué:** Textbook yield trap: huge yield, unsustainable payout ratio, downtrend, oversold, and explicit dividend-cut warning.

```json
{
  "symbol": "YIELDTRAP",
  "technical": {
    "score": 35,
    "components": {
      "trend": {
        "note": "downtrend"
      },
      "momentum": {
        "note": "oversold"
      }
    },
    "rsi": 28,
    "pctFrom52wLow": 0.05
  },
  "dividend": {
    "score": 10,
    "yieldPct": 15.2,
    "consecutiveGrowthYears": 0,
    "payoutRatioPct": 185,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Analysts warn dividend cut likely next quarter"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### A3_RETAILCO_bankruptcy_risk

**Esperado:** AVOID  
**Por qué:** Everything points down: deep downtrend, oversold, weak dividend, explicit bankruptcy-risk headline.

```json
{
  "symbol": "RETAILCO",
  "technical": {
    "score": 20,
    "components": {
      "trend": {
        "note": "downtrend"
      },
      "momentum": {
        "note": "oversold"
      }
    },
    "rsi": 22,
    "pctFrom52wLow": 0.02
  },
  "dividend": {
    "score": 15,
    "yieldPct": 1,
    "consecutiveGrowthYears": 0,
    "payoutRatioPct": 110,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Retailer warns of bankruptcy risk amid falling sales",
    "Store closures accelerate"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### A4_BIOTECHX_fda_rejection

**Esperado:** AVOID  
**Por qué:** No dividend data is irrelevant here — FDA rejection + going-concern doubts + downtrend is a clear AVOID regardless.

```json
{
  "symbol": "BIOTECHX",
  "technical": {
    "score": 30,
    "components": {
      "trend": {
        "note": "downtrend"
      },
      "momentum": {
        "note": "oversold"
      }
    },
    "rsi": 25,
    "pctFrom52wLow": 0.1
  },
  "dividend": {
    "score": 0,
    "yieldPct": null,
    "consecutiveGrowthYears": null,
    "payoutRatioPct": null,
    "insufficientData": true,
    "reason": "no_dividend_history"
  },
  "newsHeadlines": [
    "FDA rejects drug application, shares plunge 40%",
    "Pipeline setback raises going-concern doubts"
  ],
  "portfolioContext": "2/5 posiciones abiertas."
}
```

### A5_ENERGYCO_dividend_suspended

**Esperado:** AVOID  
**Por qué:** News directly contradicts the quantitative yield field (dividend was just suspended) — tests whether the agent trusts stale numbers over the news.

```json
{
  "symbol": "ENERGYCO",
  "technical": {
    "score": 40,
    "components": {
      "trend": {
        "note": "mixed"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 50,
    "pctFrom52wLow": 0.3
  },
  "dividend": {
    "score": 8,
    "yieldPct": 13.5,
    "consecutiveGrowthYears": 0,
    "payoutRatioPct": 220,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Company suspends dividend amid cash crunch"
  ],
  "portfolioContext": "1/5 posiciones abiertas."
}
```

### A6_BANKX_credit_downgrade

**Esperado:** AVOID  
**Por qué:** Regulatory capital shortfall + junk credit downgrade outweighs a decent dividend history.

```json
{
  "symbol": "BANKX",
  "technical": {
    "score": 45,
    "components": {
      "trend": {
        "note": "downtrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 48,
    "pctFrom52wLow": 0.15
  },
  "dividend": {
    "score": 60,
    "yieldPct": 4,
    "consecutiveGrowthYears": 5,
    "payoutRatioPct": 50,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Regulators flag capital shortfall",
    "Credit rating downgraded to junk"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H1_MIXEDCO_nothing_compelling

**Esperado:** HOLD  
**Por qué:** Mixed trend, mediocre everything, no news — nothing here clears the bar for action either way.

```json
{
  "symbol": "MIXEDCO",
  "technical": {
    "score": 50,
    "components": {
      "trend": {
        "note": "mixed"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 52,
    "pctFrom52wLow": 0.4
  },
  "dividend": {
    "score": 55,
    "yieldPct": 2.9,
    "consecutiveGrowthYears": 3,
    "payoutRatioPct": 65,
    "insufficientData": false
  },
  "newsHeadlines": [],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H2_OVERBOUGHT_dont_chase

**Esperado:** HOLD  
**Por qué:** Uptrend is real but RSI 82 is deep overbought territory at a new high — chasing here is exactly what a disciplined analyst avoids.

```json
{
  "symbol": "OVERBOUGHT",
  "technical": {
    "score": 55,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "overbought_risk"
      }
    },
    "rsi": 82,
    "pctFrom52wLow": 1.1
  },
  "dividend": {
    "score": 40,
    "yieldPct": 1.2,
    "consecutiveGrowthYears": 2,
    "payoutRatioPct": 70,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Stock hits new all-time high on heavy volume"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H3_NEWCO_no_data_at_all

**Esperado:** HOLD  
**Por qué:** No technical history, no dividend data, no news — the agent must never guess with nothing to go on.

```json
{
  "symbol": "NEWCO",
  "technical": {
    "score": 0,
    "insufficientData": true,
    "components": {
      "trend": {
        "note": "insufficient_history"
      }
    }
  },
  "dividend": {
    "score": 0,
    "yieldPct": null,
    "consecutiveGrowthYears": null,
    "payoutRatioPct": null,
    "insufficientData": true,
    "reason": "no_dividend_history"
  },
  "newsHeadlines": [],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H4_SMALLCAP_insufficient_technical_history

**Esperado:** HOLD  
**Por qué:** Dividend metrics look fine, but technical history is too short to confirm any trend — insufficient data on the other axis should still hold the agent back.

```json
{
  "symbol": "SMALLCAP",
  "technical": {
    "score": 0,
    "insufficientData": true,
    "components": {
      "trend": {
        "note": "insufficient_history"
      }
    }
  },
  "dividend": {
    "score": 70,
    "yieldPct": 3,
    "consecutiveGrowthYears": 8,
    "payoutRatioPct": 40,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Company reports mixed quarterly results"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H5_DIVCUTRISK_good_technicals_income_risk

**Esperado:** HOLD o AVOID  
**Por qué:** Hard case: technicals look good, but a 95% payout ratio plus an explicit dividend-cut warning is real near-term income risk. Conservative calls (HOLD or AVOID) are both acceptable; BUY would not be.

```json
{
  "symbol": "DIVCUTRISK",
  "technical": {
    "score": 65,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 58,
    "pctFrom52wLow": 0.3
  },
  "dividend": {
    "score": 35,
    "yieldPct": 3.5,
    "consecutiveGrowthYears": 0,
    "payoutRatioPct": 95,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Analysts expect possible dividend cut next year amid high payout ratio"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H6_CHOPPY_volatile_uncertainty

**Esperado:** HOLD  
**Por qué:** Mixed/oversold with mediocre dividend and a vague volatility headline — no real edge in either direction.

```json
{
  "symbol": "CHOPPY",
  "technical": {
    "score": 48,
    "components": {
      "trend": {
        "note": "mixed"
      },
      "momentum": {
        "note": "oversold"
      }
    },
    "rsi": 33,
    "pctFrom52wLow": 0.12
  },
  "dividend": {
    "score": 50,
    "yieldPct": 2,
    "consecutiveGrowthYears": 4,
    "payoutRatioPct": 60,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Shares volatile amid broader market uncertainty"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H7_PENDING_MERGER_deal_uncertainty

**Esperado:** HOLD  
**Por qué:** Good technicals, but an unconfirmed acquisition creates binary deal-risk a conservative analyst should wait out rather than chase.

```json
{
  "symbol": "PENDING_MERGER",
  "technical": {
    "score": 58,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 56,
    "pctFrom52wLow": 0.25
  },
  "dividend": {
    "score": 60,
    "yieldPct": 2.4,
    "consecutiveGrowthYears": 6,
    "payoutRatioPct": 50,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Company in exclusive talks to be acquired, deal unconfirmed"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

### H8_EARNINGS_TOMORROW_binary_event_risk

**Esperado:** HOLD o BUY  
**Por qué:** Genuinely hard case: everything looks good, but earnings tomorrow is a binary event. Both waiting (HOLD) and trusting the trend (BUY) are defensible — AVOID would not be.

```json
{
  "symbol": "EARNINGS_TOMORROW",
  "technical": {
    "score": 62,
    "components": {
      "trend": {
        "note": "uptrend"
      },
      "momentum": {
        "note": "healthy"
      }
    },
    "rsi": 59,
    "pctFrom52wLow": 0.28
  },
  "dividend": {
    "score": 68,
    "yieldPct": 2.7,
    "consecutiveGrowthYears": 9,
    "payoutRatioPct": 48,
    "insufficientData": false
  },
  "newsHeadlines": [
    "Company set to report earnings tomorrow after market close, high volatility expected"
  ],
  "portfolioContext": "0/5 posiciones abiertas."
}
```

