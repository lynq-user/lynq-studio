/**
 * Basit build script — tracker.js'i minify edip dist/lynq.min.js çıktısı verir.
 * Bağımlılık: yok (native Node.js ile çalışır).
 * Production'da terser veya esbuild kullanılabilir.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'src', 'tracker.js'), 'utf-8');

// Basit minification: comment'leri ve gereksiz whitespace'i kaldır
let minified = src
  // Block comment'leri kaldır
  .replace(/\/\*[\s\S]*?\*\//g, '')
  // Satır comment'lerini kaldır (string içindekiler hariç — basit yaklaşım)
  .replace(/^\s*\/\/.*$/gm, '')
  // Çoklu boş satırları tek satıra indir
  .replace(/\n\s*\n/g, '\n')
  // Satır başı/sonu boşlukları temizle
  .split('\n').map(l => l.trim()).filter(Boolean).join('\n');

// Çıktı klasörünü oluştur
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// Yazılmamış (readable) versiyon
fs.writeFileSync(path.join(distDir, 'lynq.js'), src);

// Minified versiyon
fs.writeFileSync(path.join(distDir, 'lynq.min.js'), minified);

const sizeKB = (Buffer.byteLength(minified) / 1024).toFixed(2);
console.log(`✓ Tracker built → dist/lynq.min.js (${sizeKB} KB)`);
