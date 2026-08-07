
export class AnsiParser {
  constructor() {
    this.colors = {
      30: '#000000', 
      31: '#CD3131', 
      32: '#0DBC79', 
      33: '#E5E510', 
      34: '#2472C8', 
      35: '#BC3FBC', 
      36: '#11A8CD', 
      37: '#E5E5E5', 
      
      90: '#666666', 
      91: '#F14C4C', 
      92: '#23D18B', 
      93: '#F5F543', 
      94: '#3B8EEA', 
      95: '#D670D6', 
      96: '#29B8DB', 
      97: '#FFFFFF', 
      
      40: '#000000',
      41: '#CD3131',
      42: '#0DBC79',
      43: '#E5E510',
      44: '#2472C8',
      45: '#BC3FBC',
      46: '#11A8CD',
      47: '#E5E5E5',
      
      100: '#666666',
      101: '#F14C4C',
      102: '#23D18B',
      103: '#F5F543',
      104: '#3B8EEA',
      105: '#D670D6',
      106: '#29B8DB',
      107: '#FFFFFF'
    };
  }

  parse(text) {
    const ansiRegex = /\x1b\[([0-9;]*)m/g;
    
    const segments = [];
    let lastIndex = 0;
    let currentStyle = this.createEmptyStyle();
    
    let match;
    while ((match = ansiRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textSegment = text.substring(lastIndex, match.index);
        segments.push({
          text: textSegment,
          style: { ...currentStyle }
        });
      }
      
      const codes = match[1] ? match[1].split(';').map(Number) : [0];
      currentStyle = this.applyCodes(currentStyle, codes);
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      segments.push({
        text: text.substring(lastIndex),
        style: { ...currentStyle }
      });
    }
    
    if (segments.length === 0) {
      segments.push({
        text: text,
        style: this.createEmptyStyle()
      });
    }
    
    return this.segmentsToHtml(segments);
  }

  createEmptyStyle() {
    return {
      color: null,
      background: null,
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      blink: false,
      reverse: false,
      hidden: false,
      strikethrough: false
    };
  }

  applyCodes(style, codes) {
    const newStyle = { ...style };
    
    let i = 0;
    while (i < codes.length) {
      const code = codes[i];
      
      switch (code) {
        case 0: 
          return this.createEmptyStyle();
        
        case 1: 
          newStyle.bold = true;
          break;
        
        case 2: 
          newStyle.dim = true;
          break;
        
        case 3: 
          newStyle.italic = true;
          break;
        
        case 4: 
          newStyle.underline = true;
          break;
        
        case 5: 
          newStyle.blink = true;
          break;
        
        case 7: 
          newStyle.reverse = true;
          break;
        
        case 8: 
          newStyle.hidden = true;
          break;
        
        case 9: 
          newStyle.strikethrough = true;
          break;
        
        case 22: 
          newStyle.bold = false;
          newStyle.dim = false;
          break;
        
        case 23: 
          newStyle.italic = false;
          break;
        
        case 24: 
          newStyle.underline = false;
          break;
        
        case 25: 
          newStyle.blink = false;
          break;
        
        case 27:
          newStyle.reverse = false;
          break;
        
        case 28: 
          newStyle.hidden = false;
          break;
        
        case 29: 
          newStyle.strikethrough = false;
          break;
        
        case 39:
          newStyle.color = null;
          break;
        
        case 49:
          newStyle.background = null;
          break;
        
        case 38:
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            newStyle.color = this.get256Color(codes[i + 2]);
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            newStyle.color = `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`;
            i += 4;
          }
          break;
        
        case 48: 
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            newStyle.background = this.get256Color(codes[i + 2]);
            i += 2;
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            newStyle.background = `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`;
            i += 4;
          }
          break;
        
        default:
          if (this.colors[code]) {
            if (code >= 30 && code <= 37) {
              newStyle.color = this.colors[code];
            } else if (code >= 40 && code <= 47) {
              newStyle.background = this.colors[code];
            } else if (code >= 90 && code <= 97) {
              newStyle.color = this.colors[code];
            } else if (code >= 100 && code <= 107) {
              newStyle.background = this.colors[code];
            }
          }
      }
      
      i++;
    }
    
    return newStyle;
  }

  get256Color(code) {
    if (code < 16) {
      const mapping = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
      return this.colors[mapping[code]];
    }
    
    if (code >= 16 && code <= 231) {
      const index = code - 16;
      const r = Math.floor(index / 36);
      const g = Math.floor((index % 36) / 6);
      const b = index % 6;
      
      const toRgb = (v) => v === 0 ? 0 : 55 + v * 40;
      
      return `rgb(${toRgb(r)}, ${toRgb(g)}, ${toRgb(b)})`;
    }
    
    if (code >= 232 && code <= 255) {
      const gray = 8 + (code - 232) * 10;
      return `rgb(${gray}, ${gray}, ${gray})`;
    }
    
    return null;
  }

  segmentsToHtml(segments, additionalColorizer = null) {
    return segments.map(segment => {
      if (!segment.text) return '';
      
      const style = segment.style;
      const hasStyle = style.color || style.background || style.bold || 
                      style.dim || style.italic || style.underline || 
                      style.strikethrough || style.reverse || style.hidden;
      
      
      let escapedText = this.escapeHtml(segment.text);
      
      if (additionalColorizer) {
        escapedText = additionalColorizer(escapedText, segment.text);
      }
      
      if (!hasStyle) {
        return escapedText;
      }
      
      const styles = [];
      const classes = [];
      
      let color = style.color;
      let background = style.background;
      
      if (style.reverse) {
        [color, background] = [background || '#E5E5E5', color || '#000000'];
      }
      
      if (color) styles.push(`color: ${color}`);
      if (background) styles.push(`background-color: ${background}`);
      
      if (style.bold) {
        styles.push('font-weight: bold');
      }
      
      if (style.dim) {
        styles.push('opacity: 0.6');
      }
      
      if (style.italic) {
        styles.push('font-style: italic');
      }
      
      if (style.underline) {
        styles.push('text-decoration: underline');
      }
      
      if (style.strikethrough) {
        styles.push('text-decoration: line-through');
      }
      
      if (style.blink) {
        classes.push('ansi-blink');
      }
      
      if (style.hidden) {
        styles.push('visibility: hidden');
      }
      
      const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
      const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
      
      return `<span${classAttr}${styleAttr}>${escapedText}</span>`;
    }).join('');
  }
  
  parseWithColorizer(text, colorizer) {
    const ansiRegex = /\x1b\[([0-9;]*)m/g;
    
    const segments = [];
    let lastIndex = 0;
    let currentStyle = this.createEmptyStyle();
    
    let match;
    while ((match = ansiRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textSegment = text.substring(lastIndex, match.index);
        segments.push({
          text: textSegment,
          style: { ...currentStyle }
        });
      }
      
      const codes = match[1] ? match[1].split(';').map(Number) : [0];
      currentStyle = this.applyCodes(currentStyle, codes);
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      segments.push({
        text: text.substring(lastIndex),
        style: { ...currentStyle }
      });
    }
    
    if (segments.length === 0) {
      segments.push({
        text: text,
        style: this.createEmptyStyle()
      });
    }
    
    return this.segmentsToHtml(segments, colorizer);
  }

  // Text-context only: this leaves " and ' unescaped, so the result must never
  // be interpolated into an attribute. Use escapeHtml() from sanitize.js there.
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

export const ansiParser = new AnsiParser();

export default AnsiParser;