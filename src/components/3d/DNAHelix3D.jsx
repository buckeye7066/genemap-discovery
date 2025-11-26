import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function DNAHelix3D({ width = 400, height = 400, className = "" }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 15;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x3b82f6, 1, 100);
    pointLight.position.set(-10, -10, 10);
    scene.add(pointLight);

    // DNA Helix Group
    const dnaGroup = new THREE.Group();
    scene.add(dnaGroup);

    // Create DNA helix
    const helixRadius = 2;
    const helixHeight = 20;
    const turns = 3;
    const pointsPerTurn = 20;
    const totalPoints = turns * pointsPerTurn;

    // Base pair colors
    const colors = {
      adenine: 0x4ade80,   // Green
      thymine: 0xf87171,   // Red
      guanine: 0x60a5fa,   // Blue
      cytosine: 0xfbbf24   // Yellow
    };
    const colorArray = [colors.adenine, colors.thymine, colors.guanine, colors.cytosine];

    // Backbone material
    const backboneMaterial1 = new THREE.MeshPhongMaterial({ 
      color: 0x3b82f6,
      shininess: 100,
      emissive: 0x1e40af,
      emissiveIntensity: 0.2
    });
    const backboneMaterial2 = new THREE.MeshPhongMaterial({ 
      color: 0x8b5cf6,
      shininess: 100,
      emissive: 0x5b21b6,
      emissiveIntensity: 0.2
    });

    // Create backbone spheres and base pairs
    for (let i = 0; i < totalPoints; i++) {
      const t = i / totalPoints;
      const angle = t * Math.PI * 2 * turns;
      const y = (t - 0.5) * helixHeight;

      // Strand 1 position
      const x1 = Math.cos(angle) * helixRadius;
      const z1 = Math.sin(angle) * helixRadius;

      // Strand 2 position (opposite side)
      const x2 = Math.cos(angle + Math.PI) * helixRadius;
      const z2 = Math.sin(angle + Math.PI) * helixRadius;

      // Backbone spheres
      const sphereGeo = new THREE.SphereGeometry(0.25, 16, 16);
      
      const sphere1 = new THREE.Mesh(sphereGeo, backboneMaterial1);
      sphere1.position.set(x1, y, z1);
      dnaGroup.add(sphere1);

      const sphere2 = new THREE.Mesh(sphereGeo, backboneMaterial2);
      sphere2.position.set(x2, y, z2);
      dnaGroup.add(sphere2);

      // Base pairs (connecting rods) - every other point
      if (i % 2 === 0) {
        const basePairColor = colorArray[i % 4];
        const basePairMaterial = new THREE.MeshPhongMaterial({ 
          color: basePairColor,
          shininess: 80,
          transparent: true,
          opacity: 0.9
        });

        // Create cylinder between the two backbone points
        const distance = Math.sqrt(
          Math.pow(x2 - x1, 2) + 
          Math.pow(z2 - z1, 2)
        );
        
        const cylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, distance, 8);
        const cylinder = new THREE.Mesh(cylinderGeo, basePairMaterial);
        
        // Position at midpoint
        cylinder.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        
        // Rotate to connect the points
        cylinder.rotation.z = Math.PI / 2;
        cylinder.rotation.y = angle;
        
        dnaGroup.add(cylinder);

        // Add nucleotide spheres at center
        const nucleoGeo = new THREE.SphereGeometry(0.15, 12, 12);
        const nucleo1 = new THREE.Mesh(nucleoGeo, basePairMaterial);
        nucleo1.position.set(x1 * 0.6, y, z1 * 0.6);
        dnaGroup.add(nucleo1);

        const nucleo2 = new THREE.Mesh(nucleoGeo, basePairMaterial);
        nucleo2.position.set(x2 * 0.6, y, z2 * 0.6);
        dnaGroup.add(nucleo2);
      }

      // Connect backbone spheres with tubes
      if (i > 0) {
        const prevT = (i - 1) / totalPoints;
        const prevAngle = prevT * Math.PI * 2 * turns;
        const prevY = (prevT - 0.5) * helixHeight;

        // Strand 1 connection
        const prevX1 = Math.cos(prevAngle) * helixRadius;
        const prevZ1 = Math.sin(prevAngle) * helixRadius;
        
        const tubeGeo1 = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
        const tube1 = new THREE.Mesh(tubeGeo1, backboneMaterial1);
        tube1.position.set((x1 + prevX1) / 2, (y + prevY) / 2, (z1 + prevZ1) / 2);
        tube1.lookAt(new THREE.Vector3(x1, y, z1));
        tube1.rotateX(Math.PI / 2);
        dnaGroup.add(tube1);

        // Strand 2 connection
        const prevX2 = Math.cos(prevAngle + Math.PI) * helixRadius;
        const prevZ2 = Math.sin(prevAngle + Math.PI) * helixRadius;
        
        const tube2 = new THREE.Mesh(tubeGeo1.clone(), backboneMaterial2);
        tube2.position.set((x2 + prevX2) / 2, (y + prevY) / 2, (z2 + prevZ2) / 2);
        tube2.lookAt(new THREE.Vector3(x2, y, z2));
        tube2.rotateX(Math.PI / 2);
        dnaGroup.add(tube2);
      }
    }

    // Add floating particles
    const particleCount = 50;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 20;
      positions[i + 1] = (Math.random() - 0.5) * 25;
      positions[i + 2] = (Math.random() - 0.5) * 20;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x60a5fa,
      size: 0.1,
      transparent: true,
      opacity: 0.6
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Mouse interaction
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        mouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
        mouseY = ((e.clientY - rect.top) / height - 0.5) * 2;
      }
    };
    containerRef.current.addEventListener('mousemove', handleMouseMove);

    // Animation
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      // Rotate DNA
      dnaGroup.rotation.y += 0.005;
      
      // Mouse-based rotation
      dnaGroup.rotation.x = mouseY * 0.3;
      dnaGroup.rotation.z = mouseX * 0.1;

      // Animate particles
      particles.rotation.y += 0.001;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      containerRef.current?.removeEventListener('mousemove', handleMouseMove);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, [width, height]);

  return (
    <div 
      ref={containerRef} 
      className={className}
      style={{ width, height }}
    />
  );
}