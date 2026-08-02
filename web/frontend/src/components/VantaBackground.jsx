import React, { useState, useEffect, useRef } from 'react';

const VantaBackground = () => {
  const [vantaEffect, setVantaEffect] = useState(null);
  const vantaRef = useRef(null);

  useEffect(() => {
    // Vanta and Three are loaded via CDN in index.html to prevent production tree-shaking issues
    if (!vantaEffect && vantaRef.current && window.VANTA && window.VANTA.FOG) {
      try {
        const vanta = window.VANTA.FOG({
          el: vantaRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.00,
          minWidth: 200.00,
          highlightColor: 0xff00d1,
          midtoneColor: 0x00b3ff,
          lowlightColor: 0x2d00ff,
          baseColor: 0xffebeb,
          blurFactor: 0.53,
          zoom: 1.00,
          speed: 1.00
        });
        setVantaEffect(vanta);
      } catch (e) {
        console.error("Vanta initialization failed:", e);
      }
    }

    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, [vantaEffect]);

  return (
    <div 
      ref={vantaRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1
      }}
    >
      {/* Optional dark overlay to ensure white text remains readable over the fog */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)'
      }} />
    </div>
  );
};

export default VantaBackground;
