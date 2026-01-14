/**
 * Watermark Pro Ultimate - Core Application Logic
 * Powered by Fabric.js
 * Developer: Dippan Bhusal
 * Repo: https://github.com/kdippan/watermark-pro
 */

class WatermarkApp {
    constructor() {
        // Core State
        this.canvas = null;
        this.batchQueue = []; 
        this.currentImageFile = null;
        
        // Undo/Redo State
        this.history = [];
        this.historyStep = -1;
        this.isHistoryLocked = false;

        // Tour Configuration
        this.tourStep = 0;
        this.tourSteps = [
            { id: 'tourUploadTarget', text: 'Start here! Upload your photos using this button or drag & drop them.' },
            { id: 'sidebarPanel', text: 'This is your control center. Add Text, Logos, and adjust opacity or scale.' },
            { id: 'canvasContainer', text: 'Your workspace. Drag watermarks around to position them perfectly.' },
            { id: 'batchBtn', text: 'Power Feature: Upload multiple images to process them all at once!' }
        ];

        this.init();
    }

    init() {
        // Initialize Fabric Canvas
        this.canvas = new fabric.Canvas('c', {
            preserveObjectStacking: true, 
            backgroundColor: null
        });

        // Setup
        this.bindEvents();
        this.loadPresets();
        this.handleWindowResize();
        this.loadTheme();
        
        // Wait 1 second before showing privacy dialog (if not accepted)
        setTimeout(() => this.checkCookieConsent(), 1000);
    }

    // ==========================================
    // 1. Privacy, Cookies & Tour
    // ==========================================

    checkCookieConsent() {
        if (!localStorage.getItem('cookieConsent')) {
            const box = document.getElementById('cookieBox');
            if(box) box.style.display = 'block';
        } else {
            // If already accepted, check if they need the tour
            this.checkTour();
        }
    }

    acceptCookies() {
        localStorage.setItem('cookieConsent', 'true');
        const box = document.getElementById('cookieBox');
        if(box) box.style.display = 'none';
        this.checkTour();
    }

    checkTour() {
        if (!localStorage.getItem('tourSeen')) {
            this.startTour();
        }
    }

    startTour() {
        this.tourStep = 0;
        this.showTourStep();
    }

    showTourStep() {
        const step = this.tourSteps[this.tourStep];
        const target = document.getElementById(step.id);
        const tooltip = document.getElementById('tourTooltip');
        const text = document.getElementById('tourText');

        if (!target || !tooltip) return;

        // Remove old highlights
        document.querySelectorAll('.tour-active').forEach(el => el.classList.remove('tour-active'));
        
        // Add highlight
        target.classList.add('tour-active');

        // Position Tooltip Smartly
        const rect = target.getBoundingClientRect();
        let top, left;

        // Special positioning for Sidebar
        if (step.id === 'sidebarPanel') {
            top = rect.top + 100;
            left = rect.right + 20;
        } else if (step.id === 'canvasContainer') {
            top = rect.top + 50;
            left = rect.left + 50;
        } else {
            top = rect.bottom + 15;
            left = rect.left;
        }

        // Edge detection to prevent overflow
        if (left + 300 > window.innerWidth) left = window.innerWidth - 320;
        if (top + 150 > window.innerHeight) top = window.innerHeight - 200;

        tooltip.style.display = 'block';
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        text.innerText = step.text;
    }

    nextTourStep() {
        this.tourStep++;
        if (this.tourStep < this.tourSteps.length) {
            this.showTourStep();
        } else {
            this.endTour();
        }
    }

    endTour() {
        const tooltip = document.getElementById('tourTooltip');
        if(tooltip) tooltip.style.display = 'none';
        document.querySelectorAll('.tour-active').forEach(el => el.classList.remove('tour-active'));
        localStorage.setItem('tourSeen', 'true');
    }

    // ==========================================
    // 2. Event Listeners
    // ==========================================

    bindEvents() {
        // Drag & Drop
        const container = document.getElementById('canvasContainer');
        if(container) {
            container.addEventListener('dragover', (e) => e.preventDefault());
            container.addEventListener('drop', (e) => {
                e.preventDefault();
                if(e.dataTransfer.files.length) this.handleFiles(e.dataTransfer.files);
            });
        }

        // File Inputs
        const mainUpload = document.getElementById('mainUpload');
        if(mainUpload) mainUpload.addEventListener('change', (e) => this.handleFiles(e.target.files));

        const logoInput = document.getElementById('logoInput');
        if(logoInput) logoInput.addEventListener('change', (e) => {
            if(e.target.files[0]) this.addLogo(e.target.files[0]);
        });

        // Fabric Canvas Events
        this.canvas.on('selection:created', () => this.updatePropPanel());
        this.canvas.on('selection:updated', () => this.updatePropPanel());
        this.canvas.on('selection:cleared', () => this.updatePropPanel());
        this.canvas.on('object:added', () => this.saveHistory());
        this.canvas.on('object:modified', () => this.saveHistory());
        this.canvas.on('object:removed', () => this.saveHistory());

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); this.redo(); }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if(document.activeElement.tagName !== 'INPUT') this.deleteObject();
            }
        });

        // Theme Toggle
        const themeBtn = document.getElementById('themeToggle');
        if(themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

        // Property Inputs
        this.bindInput('propText', 'text');
        this.bindInput('propColor', 'fill');
        this.bindInput('propOpacity', 'opacity');
        this.bindInput('propScale', 'scaleX');
    }

    bindInput(id, prop) {
        const el = document.getElementById(id);
        if(!el) return;
        
        // Real-time update
        el.addEventListener('input', (e) => {
            const active = this.canvas.getActiveObject();
            if (!active) return;
            
            let val = e.target.value;
            if (prop === 'scaleX') { 
                val = parseFloat(val); 
                active.set({ scaleX: val, scaleY: val }); 
            } else if (prop === 'opacity') { 
                active.set(prop, parseFloat(val)); 
            } else { 
                active.set(prop, val); 
            }
            this.canvas.requestRenderAll();
        });

        // Save history on release
        el.addEventListener('change', () => this.saveHistory());
    }

    // ==========================================
    // 3. File & Image Logic
    // ==========================================

    handleFiles(files) {
        const fileArray = Array.from(files);
        if (fileArray.length === 0) return;

        // Load first image to canvas
        this.loadImage(fileArray[0]);

        // Add all to batch queue
        this.batchQueue = fileArray;
        this.updateBatchUI();
    }

    loadImage(file) {
        this.currentImageFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            fabric.Image.fromURL(e.target.result, (img) => {
                this.canvas.clear();
                this.history = []; 
                this.historyStep = -1;
                
                this.canvas.setWidth(img.width);
                this.canvas.setHeight(img.height);
                
                this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas), {
                    scaleX: 1, scaleY: 1
                });

                this.fitCanvasToScreen();
                
                document.body.classList.add('has-image');
                this.saveHistory(); // Initial state
            });
        };
        reader.readAsDataURL(file);
    }

    fitCanvasToScreen() {
        const container = document.getElementById('canvasContainer');
        if (!this.canvas.width || !container) return;
        
        const padding = 60;
        const scale = Math.min(
            (container.clientWidth - padding) / this.canvas.width, 
            (container.clientHeight - padding) / this.canvas.height
        );
        
        this.canvas.setZoom(scale < 1 ? scale : 1);
        // Reset Viewport pan
        this.canvas.viewportTransform[4] = 0;
        this.canvas.viewportTransform[5] = 0;
    }

    // ==========================================
    // 4. Watermark Operations
    // ==========================================

    addText() {
        const text = new fabric.IText('© Watermark', { 
            left: this.canvas.width/2, 
            top: this.canvas.height/2, 
            originX:'center', originY:'center', 
            fontFamily:'Inter', 
            fill:'#ffffff', 
            fontSize: Math.max(20, this.canvas.width*0.05), 
            shadow: new fabric.Shadow({ color:'rgba(0,0,0,0.5)', blur:5, offsetX:2, offsetY:2 }) 
        });
        this.canvas.add(text); 
        this.canvas.setActiveObject(text); 
        this.saveHistory();
    }

    addLogo(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            fabric.Image.fromURL(e.target.result, (img) => {
                if (img.width > this.canvas.width*0.3) img.scaleToWidth(this.canvas.width*0.3);
                img.set({left: this.canvas.width/2, top: this.canvas.height/2, originX:'center', originY:'center'});
                this.canvas.add(img); 
                this.canvas.setActiveObject(img); 
                this.saveHistory();
            });
        };
        reader.readAsDataURL(file);
    }

    deleteObject() {
        const active = this.canvas.getActiveObject();
        if(active) { 
            this.canvas.remove(active); 
            this.canvas.discardActiveObject(); 
            this.canvas.requestRenderAll(); 
            this.saveHistory(); 
        }
    }

    centerObject() {
        const active = this.canvas.getActiveObject();
        if(active) { 
            active.center(); 
            active.setCoords(); 
            this.canvas.requestRenderAll(); 
            this.saveHistory(); 
        }
    }

    toggleTile() {
        const active = this.canvas.getActiveObject();
        if(!active) return alert("Select a watermark to tile first.");
        
        active.clone((clonedObj) => {
            this.canvas.remove(active);
            const gap = 50;
            const tileW = clonedObj.width * clonedObj.scaleX + gap;
            const tileH = clonedObj.height * clonedObj.scaleY + gap;
            
            const cols = Math.ceil(this.canvas.width / tileW);
            const rows = Math.ceil(this.canvas.height / tileH);

            this.isHistoryLocked = true;
            for(let r=0; r<rows; r++) { 
                for(let c=0; c<cols; c++) { 
                    clonedObj.clone((tile) => { 
                        tile.set({
                            left:(c*tileW)+(gap/2), 
                            top:(r*tileH)+(gap/2), 
                            opacity:0.3, 
                            originX:'left', originY:'top'
                        }); 
                        this.canvas.add(tile); 
                    }); 
                } 
            }
            this.isHistoryLocked = false; 
            this.saveHistory(); 
            this.canvas.requestRenderAll();
        });
    }

    // ==========================================
    // 5. UI Updates
    // ==========================================

    updatePropPanel() {
        const panel = document.getElementById('layerProperties');
        if(!panel) return;

        const active = this.canvas.getActiveObject();
        if(active) {
            panel.classList.remove('disabled');
            const textInput = document.getElementById('propText');
            if(active.type === 'i-text') { 
                textInput.value = active.text; 
                textInput.disabled = false; 
            } else { 
                textInput.value = "Image Object"; 
                textInput.disabled = true; 
            }
            document.getElementById('propColor').value = active.fill || '#000000';
            document.getElementById('propOpacity').value = active.opacity || 1;
            document.getElementById('propScale').value = active.scaleX ? active.scaleX.toFixed(2) : 1;
        } else { 
            panel.classList.add('disabled'); 
        }
    }

    updateBatchUI() {
        const list = document.getElementById('batchList');
        const btn = document.getElementById('batchBtn');
        if(!list || !btn) return;

        list.innerHTML = '';
        if(this.batchQueue.length > 0) {
            this.batchQueue.forEach(f => { 
                list.innerHTML += `<li><span>${f.name}</span> <span style="font-size:0.8em; color:var(--text-muted)">${(f.size/1024/1024).toFixed(2)}MB</span></li>`; 
            });
            btn.disabled = false; 
            btn.innerHTML = `Batch Process (${this.batchQueue.length})`;
        } else { 
            list.innerHTML = '<li class="empty">No images queued</li>'; 
            btn.disabled = true; 
            btn.innerHTML = 'Batch Process All'; 
        }
    }

    // ==========================================
    // 6. History (Undo/Redo) & Activity Log
    // ==========================================

    saveHistory() {
        if(this.isHistoryLocked) return;
        if(this.historyStep < this.history.length-1) {
            this.history = this.history.slice(0, this.historyStep+1);
        }
        this.history.push(JSON.stringify(this.canvas.toDatalessJSON(['id'])));
        this.historyStep++;
    }

    undo() { 
        if(this.historyStep > 0) { 
            this.historyStep--; 
            this.loadHistoryState(); 
        } 
    }

    redo() { 
        if(this.historyStep < this.history.length-1) { 
            this.historyStep++; 
            this.loadHistoryState(); 
        } 
    }

    loadHistoryState() {
        this.isHistoryLocked = true;
        this.canvas.loadFromJSON(this.history[this.historyStep], () => { 
            this.canvas.renderAll(); 
            this.isHistoryLocked = false; 
            this.updatePropPanel(); 
        });
    }

    // Logs activity for history.html
    addToHistoryLog(type, fileName, format, quality) {
        const logItem = { 
            id: Date.now(), 
            date: new Date().toISOString(), 
            type: type, 
            fileName: fileName, 
            format: format, 
            quality: quality, 
            watermarkCount: this.canvas.getObjects().length 
        };
        const historyLog = JSON.parse(localStorage.getItem('wmHistory') || '[]');
        historyLog.unshift(logItem); 
        if(historyLog.length > 50) historyLog.pop();
        localStorage.setItem('wmHistory', JSON.stringify(historyLog));
    }

    // ==========================================
    // 7. Zoom & Presets
    // ==========================================

    setZoom(delta) { 
        let zoom = this.canvas.getZoom() + delta; 
        if(zoom > 5) zoom = 5; 
        if(zoom < 0.1) zoom = 0.1; 
        this.canvas.setZoom(zoom); 
    }

    resetZoom() { this.fitCanvasToScreen(); }

    savePreset() {
        const name = prompt("Name this preset:"); 
        if(!name) return;
        const objects = this.canvas.getObjects().map(obj => obj.toObject());
        const presets = JSON.parse(localStorage.getItem('wmPresets') || '{}'); 
        presets[name] = objects;
        localStorage.setItem('wmPresets', JSON.stringify(presets)); 
        this.loadPresets(); 
        alert("Preset saved!");
    }

    loadPresets() {
        const select = document.getElementById('presetSelect');
        if(!select) return;
        
        const presets = JSON.parse(localStorage.getItem('wmPresets') || '{}');
        select.innerHTML = '<option value="">Load Preset...</option>';
        Object.keys(presets).forEach(key => { 
            select.innerHTML += `<option value="${key}">${key}</option>`; 
        });
    }

    loadPreset(name) {
        if(!name) return;
        const presets = JSON.parse(localStorage.getItem('wmPresets') || '{}');
        if(presets[name]) { 
            fabric.util.enlivenObjects(presets[name], (enlivened) => { 
                enlivened.forEach(obj => this.canvas.add(obj)); 
                this.canvas.requestRenderAll(); 
                this.saveHistory(); 
            }); 
        }
        document.getElementById('presetSelect').value = "";
    }

    // ==========================================
    // 8. Exports & Batch Processing
    // ==========================================

    getExportSettings() { 
        return { 
            format: document.getElementById('exportFormat').value, 
            quality: parseInt(document.getElementById('exportQuality').value)/100 
        }; 
    }
    
    exportCurrent() {
        if(!this.currentImageFile) return alert("Please upload an image first.");
        const settings = this.getExportSettings();
        
        // Temporarily reset zoom for full-res export
        const z = this.canvas.getZoom();
        const vpt = this.canvas.viewportTransform;
        this.canvas.setZoom(1); 
        this.canvas.viewportTransform = [1,0,0,1,0,0];
        
        const dataURL = this.canvas.toDataURL({
            format: settings.format.split('/')[1], 
            quality: settings.quality, 
            multiplier: 1
        });
        
        // Restore zoom
        this.canvas.setZoom(z); 
        this.canvas.viewportTransform = vpt;
        
        saveAs(dataURL, `watermarked_${this.currentImageFile.name}`);
        this.addToHistoryLog('single', this.currentImageFile.name, settings.format, settings.quality);
    }

    async processBatch() {
        if(this.batchQueue.length === 0) return;
        
        const btn = document.getElementById('batchBtn'); 
        const orig = btn.innerHTML; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; 
        btn.disabled = true;
        
        const zip = new JSZip();
        const settings = this.getExportSettings();
        const wmObjs = this.canvas.getObjects().map(o => o.toObject());
        
        // Hidden canvas for processing
        const tempCanvasEl = document.createElement('canvas');
        const fCanvas = new fabric.StaticCanvas(tempCanvasEl);
        
        try {
            for(let i=0; i < this.batchQueue.length; i++) {
                await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => { 
                        fabric.Image.fromURL(e.target.result, (img) => { 
                            fCanvas.setWidth(img.width); 
                            fCanvas.setHeight(img.height); 
                            fCanvas.setBackgroundImage(img, fCanvas.renderAll.bind(fCanvas)); 
                            
                            fabric.util.enlivenObjects(wmObjs, (objs) => { 
                                objs.forEach(o => fCanvas.add(o)); 
                                fCanvas.renderAll(); 
                                
                                const dataUrl = fCanvas.toDataURL({
                                    format: settings.format.split('/')[1], 
                                    quality: settings.quality
                                }); 
                                
                                zip.file(`watermarked_${this.batchQueue[i].name}`, dataUrl.split(',')[1], {base64: true}); 
                                fCanvas.clear(); 
                                resolve(); 
                            }); 
                        }); 
                    };
                    reader.readAsDataURL(this.batchQueue[i]);
                });
            }
            
            const content = await zip.generateAsync({type:"blob"}); 
            saveAs(content, "watermarked_batch.zip");
            this.addToHistoryLog('batch', `${this.batchQueue.length} Images`, settings.format, settings.quality); 
            alert("Batch processing complete!");
            
        } catch(e) { 
            console.error(e); 
            alert("Error processing batch."); 
        } finally { 
            btn.innerHTML = orig; 
            btn.disabled = false; 
        }
    }

    // ==========================================
    // 9. Utils & Theme
    // ==========================================

    handleWindowResize() { 
        window.addEventListener('resize', ()=> { 
            if(this.canvas) this.fitCanvasToScreen(); 
        }); 
    }

    toggleTheme() { 
        const h = document.documentElement;
        const n = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        h.setAttribute('data-theme', n); 
        localStorage.setItem('theme', n); 
    }

    loadTheme() { 
        document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light'); 
    }
}

// Start App
const app = new WatermarkApp();
