import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- APPLICATION SETUP ---
class App {
    constructor() {
        this.canvas = document.querySelector('#webgl-canvas');
        this.isTabActive = true;
        this.isMobile = window.innerWidth <= 768;
        
        // Mouse coordinate states for parallax
        this.mouse = { x: 0, y: 0 };
        this.targetMouse = { x: 0, y: 0 };

        // Moon rotation state
        this.moonRotationSpeed = 0.0008;
        this.moonStyle = 'calm';

        this.initThree();
        this.initLights();
        this.initMoon();
        this.initStars();
        this.initPostProcessing();
        this.initScrollAnimations();
        this.initResize();
        this.initNavigation();
        this.initCursor();
        this.initMouseEvents();
        this.initControlPanelEvents();
        this.initHamburger();
        
        // Start Render Loop
        this.animate();
    }

    // 1. Setup Scene, Camera, and WebGLRenderer
    initThree() {
        this.scene = new THREE.Scene();
        
        // Deep space background
        const bgColor = '#0a0e1a';
        this.scene.background = new THREE.Color(bgColor);
        this.scene.fog = new THREE.FogExp2(bgColor, 0.008);

        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            200
        );
        this.camera.position.set(0, 0, 6);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
        
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
    }

    // 2. Setup Lighting
    initLights() {
        // Subtle ambient light for space atmosphere
        this.ambientLight = new THREE.AmbientLight('#1a2040', 0.6);
        this.scene.add(this.ambientLight);

        // Main directional light (sunlight hitting the moon from the right)
        this.sunLight = new THREE.DirectionalLight('#ffe8cc', 2.2);
        this.sunLight.position.set(5, 3, 4);
        this.scene.add(this.sunLight);

        // Subtle blue rim light from the left (earth-like reflection)
        this.rimLight = new THREE.DirectionalLight('#4a8fe7', 0.6);
        this.rimLight.position.set(-5, -1, -3);
        this.scene.add(this.rimLight);

        // Top fill light
        this.topLight = new THREE.DirectionalLight('#ffffff', 0.3);
        this.topLight.position.set(0, 5, 0);
        this.scene.add(this.topLight);
    }

    // 3. Create 3D Moon with craters
    initMoon() {
        // Parent Parallax Group
        this.parallaxGroup = new THREE.Group();
        this.scene.add(this.parallaxGroup);

        // Child Scroll Group
        this.meshGroup = new THREE.Group();
        this.parallaxGroup.add(this.meshGroup);

        const moonRadius = this.isMobile ? 2.0 : 2.8;
        const detail = this.isMobile ? 48 : 80;

        // Moon geometry
        const moonGeo = new THREE.SphereGeometry(moonRadius, detail, detail);

        // Displace vertices to create crater-like terrain
        const posAttr = moonGeo.attributes.position;
        const vertex = new THREE.Vector3();

        // Generate crater data
        const craterCount = this.isMobile ? 18 : 35;
        const craters = [];
        for (let c = 0; c < craterCount; c++) {
            // Random point on sphere surface using spherical coordinates
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            craters.push({
                pos: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi)
                ),
                radius: 0.15 + Math.random() * 0.4,
                depth: 0.03 + Math.random() * 0.08
            });
        }

        for (let i = 0; i < posAttr.count; i++) {
            vertex.fromBufferAttribute(posAttr, i);
            const dir = vertex.clone().normalize();

            // Base surface noise (subtle bumpiness)
            let displacement = 0;
            displacement += Math.sin(dir.x * 12.0 + dir.y * 8.0) * 0.015;
            displacement += Math.cos(dir.z * 10.0 + dir.x * 6.0) * 0.012;
            displacement += Math.sin(dir.y * 15.0 + dir.z * 12.0) * 0.008;

            // Crater depressions
            for (const crater of craters) {
                const dist = dir.distanceTo(crater.pos);
                if (dist < crater.radius) {
                    // Smooth crater shape (parabolic depression)
                    const t = dist / crater.radius;
                    const craterShape = (1.0 - t * t) * crater.depth;
                    displacement -= craterShape;

                    // Subtle rim elevation
                    if (t > 0.7 && t < 1.0) {
                        const rimT = (t - 0.7) / 0.3;
                        displacement += Math.sin(rimT * Math.PI) * crater.depth * 0.25;
                    }
                }
            }

            vertex.addScaledVector(dir, displacement);
            posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        moonGeo.computeVertexNormals();

        // Custom shader material for moon surface
        this.moonMaterial = new THREE.MeshStandardMaterial({
            color: 0xb8bcc8,        // Light gray-blue moon surface
            roughness: 0.92,
            metalness: 0.02,
            flatShading: false,
        });

        this.moon = new THREE.Mesh(moonGeo, this.moonMaterial);
        this.meshGroup.add(this.moon);

        // Atmosphere glow ring (subtle blue-ish halo)
        const glowGeo = new THREE.SphereGeometry(moonRadius * 1.025, 48, 48);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x4a6fa5,
            transparent: true,
            opacity: 0.06,
            side: THREE.BackSide,
        });
        this.moonGlow = new THREE.Mesh(glowGeo, glowMat);
        this.meshGroup.add(this.moonGlow);

        // Outer atmosphere halo
        const haloGeo = new THREE.SphereGeometry(moonRadius * 1.08, 32, 32);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0x3a5f9f,
            transparent: true,
            opacity: 0.03,
            side: THREE.BackSide,
        });
        this.moonHalo = new THREE.Mesh(haloGeo, haloMat);
        this.meshGroup.add(this.moonHalo);

        // Position moon bottom-right
        this.meshGroup.position.set(1.5, -1.8, -2);
    }

    // 4. Create starfield background
    initStars() {
        const starCount = this.isMobile ? 800 : 2000;
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            // Distribute stars in a large sphere
            const radius = 30 + Math.random() * 70;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            sizes[i] = 0.1 + Math.random() * 0.4;

            // Vary star colors slightly (white, blue-white, warm white)
            const colorChoice = Math.random();
            if (colorChoice < 0.3) {
                // Warm white
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 0.95;
                colors[i * 3 + 2] = 0.85;
            } else if (colorChoice < 0.6) {
                // Blue-white
                colors[i * 3] = 0.85;
                colors[i * 3 + 1] = 0.9;
                colors[i * 3 + 2] = 1.0;
            } else {
                // Pure white
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 1.0;
                colors[i * 3 + 2] = 1.0;
            }
        }

        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const starMat = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    // Set moon surface color dynamically
    setMoonColor(colorName) {
        let colorHex;
        if (colorName === 'lunar') colorHex = 0xb8bcc8;          // Classic gray moon
        else if (colorName === 'blue moon') colorHex = 0x7a8fb8;  // Blue-tinted moon
        else if (colorName === 'gold') colorHex = 0xd4af70;       // Golden moon
        else return;

        gsap.to(this.moonMaterial.color, {
            r: ((colorHex >> 16) & 255) / 255,
            g: ((colorHex >> 8) & 255) / 255,
            b: (colorHex & 255) / 255,
            duration: 0.6
        });
    }

    // Set moon rotation speed
    setMoonSpeed(sizeName) {
        if (sizeName === 'small') this.moonRotationSpeed = 0.0003;
        else if (sizeName === 'medium') this.moonRotationSpeed = 0.0008;
        else if (sizeName === 'large') this.moonRotationSpeed = 0.002;
    }

    // Bind GUI control buttons
    initControlPanelEvents() {
        // Wave Style selectors (now controls moon rotation style)
        document.querySelectorAll('#wave-selectors .ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#wave-selectors .ctrl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.moonStyle = btn.dataset.wave;
            });
        });

        // Color selectors
        document.querySelectorAll('#color-selectors .ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#color-selectors .ctrl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setMoonColor(btn.dataset.color);
            });
        });

        // Size selectors (now controls rotation speed)
        document.querySelectorAll('#size-selectors .ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#size-selectors .ctrl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setMoonSpeed(btn.dataset.size);
            });
        });

        // Toggle Control Panel (Close/Open sliding animations)
        const controlPanel = document.getElementById('controlPanel');
        const closeBtn = document.getElementById('closePanelBtn');
        const openBtn = document.getElementById('openPanelBtn');

        if (controlPanel && closeBtn && openBtn) {
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                gsap.set(controlPanel, { y: '100%', opacity: 0, visibility: 'hidden' });
                gsap.set(openBtn, { scale: 1, opacity: 1, visibility: 'visible' });
            } else {
                gsap.set(controlPanel, { x: 0, opacity: 1, visibility: 'visible' });
                gsap.set(openBtn, { scale: 0.9, opacity: 0, visibility: 'hidden' });
            }

            closeBtn.addEventListener('click', () => {
                const currentIsMobile = window.innerWidth <= 768;
                gsap.timeline()
                    .to(controlPanel, { 
                        x: currentIsMobile ? 0 : -150, 
                        y: currentIsMobile ? '100%' : 0,
                        opacity: 0, 
                        duration: 0.4, 
                        ease: 'power2.inOut',
                        onComplete: () => {
                            gsap.set(controlPanel, { visibility: 'hidden' });
                        }
                    })
                    .to(openBtn, { 
                        scale: 1, 
                        opacity: 1, 
                        visibility: 'visible', 
                        duration: 0.3, 
                        ease: 'back.out(1.7)' 
                    }, '-=0.1');
            });

            openBtn.addEventListener('click', () => {
                const currentIsMobile = window.innerWidth <= 768;
                gsap.timeline()
                    .to(openBtn, { 
                        scale: 0.9, 
                        opacity: 0, 
                        duration: 0.3, 
                        ease: 'power2.in',
                        onComplete: () => {
                            gsap.set(openBtn, { visibility: 'hidden' });
                        }
                    })
                    .set(controlPanel, { visibility: 'visible' })
                    .to(controlPanel, { 
                        x: 0, 
                        y: 0,
                        opacity: 1, 
                        duration: 0.4, 
                        ease: 'power2.out' 
                    }, '-=0.1');
            });
        }
    }

    // Hamburger Menu Toggle for Mobile Navigation
    initHamburger() {
        const hamburger = document.getElementById('hamburgerBtn');
        const navLinks = document.querySelector('.nav-links');
        if (!hamburger || !navLinks) return;

        hamburger.addEventListener('click', () => {
            const isOpen = navLinks.classList.contains('open');
            if (isOpen) {
                this.closeNav(hamburger, navLinks);
            } else {
                this.openNav(hamburger, navLinks);
            }
        });

        // Auto-close nav when a link is clicked
        navLinks.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (this.isMobile && navLinks.classList.contains('open')) {
                    this.closeNav(hamburger, navLinks);
                }
            });
        });
    }

    openNav(hamburger, navLinks) {
        hamburger.classList.add('active');
        navLinks.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    closeNav(hamburger, navLinks) {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
    }

    // 5. Setup Post-processing Glow via UnrealBloomPass
    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Subtle bloom for starry atmosphere
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.35,   // strength
            0.5,    // radius
            0.8     // threshold
        );
        this.composer.addPass(this.bloomPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    // 6. Bind camera, mesh, and DOM text elements to ScrollTrigger
    initScrollAnimations() {
        gsap.registerPlugin(ScrollTrigger);

        // Set initial visibility of sections via GSAP
        gsap.set('#sec-hero', { autoAlpha: 1, y: 0, pointerEvents: 'auto' });
        gsap.set(['#sec-about', '#sec-projects', '#sec-contact'], { autoAlpha: 0, y: 30, pointerEvents: 'none' });

        // Scroll Timeline bound directly to #scroll-height-generator
        this.scrollTimeline = gsap.timeline({
            scrollTrigger: {
                trigger: '#scroll-height-generator',
                start: 'top top',
                end: 'bottom bottom',
                scrub: this.isMobile ? 0.5 : 0.8
            }
        });

        this.scrollTimeline
            // --- Phase 1: Hero to About ---
            .to('#sec-hero', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('.scroll-indicator', { autoAlpha: 0, duration: 0.5 }, '<')
            .to('#sec-about', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { x: -1.5, y: -0.5, z: -3, duration: 1 }, '<')
            .to(this.camera.position, { x: -0.5, y: 0.3, z: 5.0, duration: 1 }, '<')
            .to(this.meshGroup.rotation, { y: 0.5, duration: 1 }, '<')

            // --- Phase 2: About to Projects ---
            .to('#sec-about', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('#sec-projects', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { x: 2.0, y: 0, z: -4, duration: 1 }, '<')
            .to(this.camera.position, { x: 0.5, y: 0.2, z: 5.5, duration: 1 }, '<')
            .to(this.meshGroup.rotation, { y: -0.4, duration: 1 }, '<')

            // --- Phase 3: Projects to Contact ---
            .to('#sec-projects', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('#sec-contact', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { x: 0, y: -1.0, z: -1, duration: 1 }, '<')
            .to(this.camera.position, { x: 0, y: 0, z: 4.5, duration: 1 }, '<')
            .to(this.meshGroup.rotation, { y: 1.0, duration: 1 }, '<');

        ScrollTrigger.refresh();
    }

    // 7. Setup link clicking to scroll programmatically
    initNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        // Highlight active links on scroll
        ScrollTrigger.create({
            trigger: '#scroll-height-generator',
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (self) => {
                const progress = self.progress;
                let activeIndex = 0;
                
                if (progress > 0.8) activeIndex = 3;
                else if (progress > 0.48) activeIndex = 2;
                else if (progress > 0.15) activeIndex = 1;
                
                navLinks.forEach((link, idx) => {
                    if (idx === activeIndex) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });
            }
        });

        // Click to scroll for header links
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetIdx = parseInt(link.getAttribute('data-section'));
                const totalScroll = document.getElementById('scroll-height-generator').offsetHeight - window.innerHeight;
                const scrollPos = (targetIdx / 3) * totalScroll;
                window.scrollTo({
                    top: scrollPos,
                    behavior: 'smooth'
                });
            });
        });

        // Click to scroll for CTA buttons
        document.querySelectorAll('button[data-section]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetIdx = parseInt(btn.getAttribute('data-section'));
                const totalScroll = document.getElementById('scroll-height-generator').offsetHeight - window.innerHeight;
                const scrollPos = (targetIdx / 3) * totalScroll;
                window.scrollTo({
                    top: scrollPos,
                    behavior: 'smooth'
                });
            });
        });
    }

    // 8. Setup Custom Glowing Cursor Animations
    initCursor() {
        const dot = document.querySelector('.custom-cursor-dot');
        const outline = document.querySelector('.custom-cursor-outline');

        if (dot && outline) {
            window.addEventListener('mousemove', (e) => {
                gsap.to(dot, { x: e.clientX, y: e.clientY, duration: 0 });
                gsap.to(outline, { x: e.clientX, y: e.clientY, duration: 0.15, ease: 'power2.out' });
            });

            const hoverables = document.querySelectorAll('a, button, .project-card');
            hoverables.forEach(el => {
                el.addEventListener('mouseenter', () => {
                    dot.classList.add('hover');
                    outline.classList.add('hover');
                });
                el.addEventListener('mouseleave', () => {
                    dot.classList.remove('hover');
                    outline.classList.remove('hover');
                });
            });
        }
    }

    // 9. Capture Mouse Movements for Parallax
    initMouseEvents() {
        window.addEventListener('mousemove', (e) => {
            this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        document.addEventListener('visibilitychange', () => {
            this.isTabActive = !document.hidden;
        });
    }

    // Dynamic resizing
    initResize() {
        window.addEventListener('resize', () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            this.isMobile = width <= 768;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));

            this.composer.setSize(width, height);
            this.bloomPass.setSize(width, height);
            
            ScrollTrigger.refresh();
        });
    }

    // Render loop
    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.isTabActive) return;

        const time = Date.now() * 0.001;

        // 1. Rotate moon
        if (this.moon) {
            let rotSpeed = this.moonRotationSpeed;
            
            if (this.moonStyle === 'calm') {
                this.moon.rotation.y += rotSpeed;
            } else if (this.moonStyle === 'storm') {
                // Wobbly fast rotation
                this.moon.rotation.y += rotSpeed * 3;
                this.moon.rotation.x = Math.sin(time * 0.5) * 0.08;
            } else if (this.moonStyle === 'digital') {
                // Step rotation (discrete angles)
                this.moon.rotation.y = Math.floor(time * 0.5) * 0.2;
            }
        }

        // 2. Subtle star twinkle via slow rotation
        if (this.stars) {
            this.stars.rotation.y += 0.00005;
            this.stars.rotation.x += 0.00002;
        }

        // 3. Mouse parallax interpolation
        this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.05;
        this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.05;

        // 4. Apply parallax to moon group
        if (this.parallaxGroup) {
            this.parallaxGroup.position.x = this.mouse.x * 0.3;
            this.parallaxGroup.position.y = this.mouse.y * 0.3;
            
            this.parallaxGroup.rotation.y = this.mouse.x * 0.1;
            this.parallaxGroup.rotation.x = -this.mouse.y * 0.1;
        }

        // 5. Focus camera towards center of scene
        if (this.camera) {
            this.camera.lookAt(0, 0, 0);
        }

        // 6. Render with post-processing
        this.composer.render();
    }
}

// Start app on full window load
window.addEventListener('load', () => {
    new App();
});
