// Conversão de coordenadas: graus decimais ou sexagesimal (RA em horas, Dec em graus).
(function (root) {
  const SEPARATORS = /[hHdDmMsS°º:'′’"″\s]+/;

  function normalize(text) {
    return String(text ?? "")
      .trim()
      .replace(/[−–—]/g, "-")
      .replace(/,/g, ".")
      .replace(/''/g, '"');
  }

  function splitSexagesimal(text) {
    const sign = text.startsWith("-") ? -1 : 1;
    const parts = text.replace(/^[+-]/, "").split(SEPARATORS).filter(Boolean);
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) {
      throw new Error("formato não reconhecido");
    }
    const [whole, minutes = 0, seconds = 0] = parts.map(Number);
    if (minutes >= 60 || seconds >= 60) throw new Error("minutos e segundos devem ser menores que 60");
    return { sign, value: whole + minutes / 60 + seconds / 3600 };
  }

  function isDecimal(text) {
    return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text);
  }

  /** RA: graus decimais, horas decimais com "h" ou sexagesimal em horas (ou graus com °/d). */
  function parseRa(input) {
    const text = normalize(input);
    if (!text) throw new Error("Informe a ascensão reta.");
    let degrees;
    let format = "graus";
    if (isDecimal(text)) {
      degrees = Number(text);
    } else if (/^[+]?\d+(\.\d+)?\s*h$/i.test(text)) {
      degrees = Number(text.replace(/h/i, "")) * 15;
      format = "horas";
    } else {
      let parsed;
      try {
        parsed = splitSexagesimal(text);
      } catch (error) {
        throw new Error(`RA inválida: ${error.message}. Use 133.79 ou 08h55m10.8s.`, { cause: error });
      }
      if (parsed.sign < 0) throw new Error("RA não pode ser negativa.");
      const inDegrees = /[dD°º]/.test(text);
      degrees = inDegrees ? parsed.value : parsed.value * 15;
      format = inDegrees ? "graus sexagesimais" : "horas";
    }
    if (!Number.isFinite(degrees) || degrees < 0 || degrees >= 360) {
      throw new Error("RA deve estar entre 0° e 360° (0h e 24h).");
    }
    return { degrees, format };
  }

  /** Dec: graus decimais ou sexagesimal (−07°14′42″, −07 14 42, -07:14:42). */
  function parseDec(input) {
    const text = normalize(input);
    if (!text) throw new Error("Informe a declinação.");
    let degrees;
    let format = "graus";
    if (isDecimal(text)) {
      degrees = Number(text);
    } else {
      let parsed;
      try {
        parsed = splitSexagesimal(text);
      } catch (error) {
        throw new Error(`Dec inválida: ${error.message}. Use −7.245 ou −07°14′42″.`, { cause: error });
      }
      degrees = parsed.sign * parsed.value;
      format = "sexagesimal";
    }
    if (!Number.isFinite(degrees) || degrees < -90 || degrees > 90) {
      throw new Error("Dec deve estar entre −90° e +90°.");
    }
    return { degrees, format };
  }

  function pad(value, size) {
    return String(value).padStart(size, "0");
  }

  function sexagesimal(value, secondDigits) {
    const factor = 10 ** secondDigits;
    let total = Math.round(Math.abs(value) * 3600 * factor);
    const whole = Math.floor(total / (3600 * factor));
    total -= whole * 3600 * factor;
    const minutes = Math.floor(total / (60 * factor));
    total -= minutes * 60 * factor;
    const seconds = (total / factor).toFixed(secondDigits);
    const [int, frac] = seconds.split(".");
    return [whole, minutes, frac ? `${pad(int, 2)}.${frac}` : pad(int, 2)];
  }

  function formatRaHms(degrees) {
    const [hours, minutes, seconds] = sexagesimal(degrees / 15, 2);
    return `${pad(hours % 24, 2)}h${pad(minutes, 2)}m${seconds}s`;
  }

  function formatDecDms(degrees) {
    const [whole, minutes, seconds] = sexagesimal(degrees, 1);
    return `${degrees < 0 ? "−" : "+"}${pad(whole, 2)}°${pad(minutes, 2)}′${seconds}″`;
  }

  const api = { parseRa, parseDec, formatRaHms, formatDecDms };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.SpherexCoords = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
