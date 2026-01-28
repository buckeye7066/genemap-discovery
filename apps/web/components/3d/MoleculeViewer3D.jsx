import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

const MOLECULE_PRESETS = {
  water: {
    atoms: [
      { element: 'O', position: [0, 0, 0], color: 0xf87171, radius: 0.6 },
      { element: 'H', position: [-0.8, 0.6, 0], color: 0xffffff, radius: 0.3 },
      { element: 'H', position: [0.8, 0.6, 0], color: 0xffffff, radius: 0.3 }
    ],
    bonds: [[0, 1], [0, 2]]
  },
  methane: {
    atoms: [
      { element: 'C', position: [0, 0, 0], color: 0x4b5563, radius: 0.5 },
      { element: 'H', position: [1, 1, 1], color: 0xffffff, radius: 0.3 },
      { element: 'H', position: [-1, -1, 1], color: 0xffffff, radius: 0.3 },
      { element: 'H', position: [-1, 1, -1], color: 0xffffff, radius: 0.3 },
      { element: 'H', position: [1, -1, -1], color: 0xffffff, radius: 0.3 }
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4]]
  },
  caffeine: {
    atoms: [
      // Simplified caffeine structure
      { element: 'N', position: [0, 0, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [1.2, 0.3, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'N', position: [2, -0.5, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [1.5, -1.5, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [0.2, -1.2, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'O', position: [-0.8, -1.8, 0], color: 0xf87171, radius: 0.45 },
      { element: 'N', position: [2.2, -2.5, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [3.2, -1.8, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'N', position: [3.2, -0.5, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [-0.8, 1, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'O', position: [1.5, 1.4, 0], color: 0xf87171, radius: 0.45 },
      { element: 'C', position: [2.2, -3.8, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [4.4, 0.2, 0], color: 0x4b5563, radius: 0.4 }
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [4, 5], [3, 6], [6, 7], [7, 8], [8, 2], [0, 9], [1, 10], [6, 11], [8, 12]]
  },
  benzene: {
    atoms: [
      { element: 'C', position: [1, 0, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [0.5, 0.87, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [-0.5, 0.87, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [-1, 0, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [-0.5, -0.87, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [0.5, -0.87, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'H', position: [2, 0, 0], color: 0xffffff, radius: 0.25 },
      { element: 'H', position: [1, 1.73, 0], color: 0xffffff, radius: 0.25 },
      { element: 'H', position: [-1, 1.73, 0], color: 0xffffff, radius: 0.25 },
      { element: 'H', position: [-2, 0, 0], color: 0xffffff, radius: 0.25 },
      { element: 'H', position: [-1, -1.73, 0], color: 0xffffff, radius: 0.25 },
      { element: 'H', position: [1, -1.73, 0], color: 0xffffff, radius: 0.25 }
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]]
  },
  adenine: {
    atoms: [
      { element: 'N', position: [0, 0, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [1.2, 0.5, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'N', position: [2.3, -0.1, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [2.2, -1.4, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [0.9, -1.8, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'C', position: [0, -0.9, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'N', position: [-1.3, -1.2, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [-1.8, -2.4, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'N', position: [-0.8, -3.2, 0], color: 0x3b82f6, radius: 0.45 },
      { element: 'C', position: [0.4, -3.1, 0], color: 0x4b5563, radius: 0.4 },
      { element: 'N', position: [1.2, 1.8, 0], color: 0x3b82f6, radius: 0.45 }
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [5, 6], [6, 7], [7, 8], [8, 9], [9, 4], [1, 10]]
  }
};

export default function MoleculeViewer3D({ 
  molecule = 'caffeine', 
  width = 300, 
  height = 300,
  autoRotate = true,
  className = ""
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const animationRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [webGLAvailable, setWebGLAvailable] = useState(true);

  // Check WebGL availability
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) setWebGLAvailable(false);
    } catch (e) {
      setWebGLAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !webGLAvailable) return;

    const moleculeData = MOLECULE_PRESETS[molecule] || MOLECULE_PRESETS.caffeine;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x60a5fa, 0.5, 50);
    pointLight.position.set(-5, -5, 5);
    scene.add(pointLight);

    // Molecule group
    const moleculeGroup = new THREE.Group();
    scene.add(moleculeGroup);

    // Create atoms
    moleculeData.atoms.forEach((atom) => {
      const geometry = new THREE.SphereGeometry(atom.radius, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: atom.color,
        shininess: 100,
        specular: 0x444444
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(...atom.position);
      moleculeGroup.add(sphere);

      // Add glow effect
      const glowGeometry = new THREE.SphereGeometry(atom.radius * 1.2, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: atom.color,
        transparent: true,
        opacity: 0.15
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.set(...atom.position);
      moleculeGroup.add(glow);
    });

    // Create bonds
    const bondMaterial = new THREE.MeshPhongMaterial({
      color: 0x9ca3af,
      shininess: 50
    });

    moleculeData.bonds.forEach(([i, j]) => {
      const atom1 = moleculeData.atoms[i];
      const atom2 = moleculeData.atoms[j];
      
      const start = new THREE.Vector3(...atom1.position);
      const end = new THREE.Vector3(...atom2.position);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      
      const geometry = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
      const bond = new THREE.Mesh(geometry, bondMaterial);
      
      bond.position.copy(mid);
      bond.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize()
      );
      
      moleculeGroup.add(bond);
    });

    // Center the molecule
    const box = new THREE.Box3().setFromObject(moleculeGroup);
    const center = box.getCenter(new THREE.Vector3());
    moleculeGroup.position.sub(center);

    // Mouse interaction
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = () => { isDragging = true; };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        
        moleculeGroup.rotation.y += deltaX * 0.01;
        moleculeGroup.rotation.x += deltaY * 0.01;
      }
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseleave', onMouseUp);

    // Animation
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      if (autoRotate && !isDragging) {
        moleculeGroup.rotation.y += 0.01;
        moleculeGroup.rotation.x += 0.002;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseleave', onMouseUp);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, [molecule, width, height, autoRotate]);

  // Molecule emoji fallbacks
  const moleculeEmojis = {
    water: '💧',
    methane: '⚗️',
    caffeine: '☕',
    benzene: '⬡',
    adenine: '🧬'
  };

  // WebGL fallback
  if (!webGLAvailable) {
    return (
      <div 
        className={`flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-100 rounded-xl ${className}`}
        style={{ width, height }}
      >
        <div className="text-center p-4">
          <div className="text-3xl mb-1">{moleculeEmojis[molecule] || '⚛️'}</div>
          <p className="text-xs text-slate-600 capitalize">{molecule}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`cursor-grab active:cursor-grabbing ${className}`}
      style={{ width, height }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    />
  );
}