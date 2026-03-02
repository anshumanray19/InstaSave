const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'dist');

// Folders/files to ignore during build
const ignoreList = ['node_modules', '.git', 'dist', 'build.js', 'README.md', '.gitignore'];

console.log('📦 Starting build process...');

// Clean existing dist folder
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
    console.log('🧹 Cleaned previous build directory.');
}

// Create new dist folder
fs.mkdirSync(destDir);

// Helper function to copy recursively
function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    const baseName = path.basename(src);
    if (ignoreList.includes(baseName)) {
        return;
    }

    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Copy source files to dist
fs.readdirSync(srcDir).forEach(childItemName => {
    copyRecursiveSync(path.join(srcDir, childItemName), path.join(destDir, childItemName));
});

console.log('✅ Build successful! All necessary files are copied to the "dist" folder.');
console.log('🚀 You can now zip the "dist" folder and upload it to your EC2 instance.');
