/**
 * Traceable — Canvas Engine & Real-Time Socket Client
 */

(function () {
  'use strict';

  // --- Socket Initialization ---
  const socket = io({
    transports: ['websocket', 'polling'],
  });

  // --- State Variables & Persistent Session Keys ---
  const CLIENT_ID_KEY = 'traceable_client_id';
  const ROOM_CODE_KEY = 'traceable_room';
  const USER_NAME_KEY = 'traceable_username';

  let persistentClientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!persistentClientId) {
    persistentClientId = 'cli_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(CLIENT_ID_KEY, persistentClientId);
  }

  let currentRoomCode = null;
  let currentUserId = persistentClientId;
  let currentUserInfo = null;
  
  let currentTool = 'brush'; // 'brush' | 'eraser' | 'shape' | 'text'
  let currentShapeType = 'rect';
  let currentColor = '#FFFFFF';
  let currentWidth = 4;

  let isHost = false;
  let currentHostId = null;
  let currentLayout = 'grid';

  const LAYOUT_NAMES = {
    'grid': 'Classic Grid',
    'dots': 'Dot Matrix',
    'graph': 'Graph Paper',
    'isometric': 'Isometric 3D',
    'hexagonal': 'Honeycomb',
    'polar': 'Polar / Radar',
    'blueprint': 'Blueprint',
    'ruled': 'Ruled Notepad',
    'college-ruled': 'Margin Ruled',
    'cornell': 'Cornell Notes',
    'music': 'Music Staff',
    'kanban': 'Kanban Board',
    'swot': 'SWOT Matrix',
    'quadrant': '4-Quadrant Grid',
    'storyboard': 'Storyboard',
    'calendar': 'Weekly Planner',
    'blank': 'Pure Canvas',
  };

  let shapesHistory = []; // Array of shape objects
  const remoteDraftsMap = new Map(); // Map<userId, draftShape>
  const remoteCursorsMap = new Map(); // Map<userId, cursorElement>

  // Per-user Undo / Redo Stacks
  const undoStack = []; // Array of shape IDs created by current user
  const redoStack = []; // Array of shape objects created by current user that were undone

  let isDrawing = false;
  let currentShape = null;
  let activeTextPosition = null;

  // --- DOM Elements ---
  const modalOverlay = document.getElementById('room-modal-overlay');
  const userNameInput = document.getElementById('user-name-input');
  const roomCodeInput = document.getElementById('room-code-input');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const modalErrorMsg = document.getElementById('modal-error-msg');

  const appWorkspace = document.getElementById('app-workspace');
  const roomCodeDisplay = document.getElementById('room-code-display');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const onlineCount = document.getElementById('online-count');
  const userAvatarsList = document.getElementById('user-avatars-list');

  // Scratchpad Layout & Host UI Elements
  const canvasSheet = document.getElementById('canvas-sheet');
  const btnLayoutPicker = document.getElementById('btn-layout-picker');
  const activeLayoutLabel = document.getElementById('active-layout-label');
  const hostCrownBadge = document.getElementById('host-crown-badge');
  const layoutModalOverlay = document.getElementById('layout-modal-overlay');
  const btnCloseLayoutModal = document.getElementById('btn-close-layout-modal');
  const layoutCards = document.querySelectorAll('.layout-card');

  const toolBtns = document.querySelectorAll('.tool-btn');
  const toolShapesBtn = document.getElementById('tool-shapes');
  const shapesPopover = document.getElementById('shapes-popover');
  const activeShapeIcon = document.getElementById('active-shape-icon');
  const shapeItems = document.querySelectorAll('.shape-item');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const customColorInput = document.getElementById('custom-color-input');
  const strokeWidthSlider = document.getElementById('stroke-width-slider');
  const strokeWidthVal = document.getElementById('stroke-width-val');

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');

  const canvasContainer = document.getElementById('canvas-container');
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d');
  const remoteCursorsContainer = document.getElementById('remote-cursors-container');
  
  const textToolOverlay = document.getElementById('text-tool-overlay');
  const textToolInput = document.getElementById('text-tool-input');
  const toastContainer = document.getElementById('toast-container');

  // Collaborative Text Chat Elements
  let isChatOpen = false;
  let unreadChatCount = 0;

  const btnToggleChat = document.getElementById('btn-toggle-chat');
  const chatSidebar = document.getElementById('chat-sidebar');
  const btnCloseChat = document.getElementById('btn-close-chat');
  const chatMessages = document.getElementById('chat-messages');
  const chatEmptyState = document.getElementById('chat-empty-state');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatUnreadBadge = document.getElementById('chat-unread-badge');
  const chatFab = document.getElementById('chat-fab');
  const chatFabUnread = document.getElementById('chat-fab-unread');
  const chatBackdrop = document.getElementById('chat-backdrop');

  // Mobile Header Pop-out Elements
  const btnMobileHeaderMenu = document.getElementById('btn-mobile-header-menu');
  const mobileHeaderPopout = document.getElementById('mobile-header-popout');
  const mobileHeaderBackdrop = document.getElementById('mobile-header-backdrop');
  const btnCloseMobileHeader = document.getElementById('btn-close-mobile-header');
  const btnMobileShareLink = document.getElementById('btn-mobile-share-link');
  const btnMobileLayoutPicker = document.getElementById('btn-mobile-layout-picker');
  const mobileLayoutLabel = document.getElementById('mobile-layout-label');
  const mobileHostBadge = document.getElementById('mobile-host-badge');
  const mobileOnlineCount = document.getElementById('mobile-online-count');
  const mobileUsersList = document.getElementById('mobile-users-list');
  const btnMobileLeaveRoom = document.getElementById('btn-mobile-leave-room');

  // Mobile Toolbar Pop-out Elements
  const btnMobileStylePopout = document.getElementById('btn-mobile-style-popout');
  const mobileActiveColorDot = document.getElementById('mobile-active-color-dot');
  const mobileActiveStrokeLabel = document.getElementById('mobile-active-stroke-label');
  const mobileStylePopout = document.getElementById('mobile-style-popout');
  const btnCloseMobileStyle = document.getElementById('btn-close-mobile-style');
  const mobileSwatches = document.querySelectorAll('.mobile-swatch');
  const mobileCustomColorInput = document.getElementById('mobile-custom-color-input');
  const mobileStrokeSlider = document.getElementById('mobile-stroke-slider');
  const mobileSliderReadout = document.getElementById('mobile-slider-readout');

  const btnMobileMorePopout = document.getElementById('btn-mobile-more-popout');
  const mobileMorePopout = document.getElementById('mobile-more-popout');
  const btnMobileClear = document.getElementById('btn-mobile-clear');

  // --- Unique ID Generator ---
  function generateId() {
    return 'shp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('width', '18');
    iconSvg.setAttribute('height', '18');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '2');
    iconSvg.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
    
    const span = document.createElement('span');
    span.textContent = message;

    toast.appendChild(iconSvg);
    toast.appendChild(span);
    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  // --- URL Hash Auto-Fill ---
  function checkUrlHash() {
    const hash = window.location.hash || '';
    const match = hash.match(/#room=([A-Z0-9]{5})/i);
    if (match && match[1]) {
      roomCodeInput.value = match[1].toUpperCase();
    }
  }

  checkUrlHash();

  // --- Canvas High-DPI Resizing ---
  let dpr = window.devicePixelRatio || 1;
  let canvasWidth = 0;
  let canvasHeight = 0;

  function resizeCanvas() {
    if (!canvasContainer) return;
    dpr = window.devicePixelRatio || 1;
    canvasWidth = canvasContainer.clientWidth;
    canvasHeight = canvasContainer.clientHeight;

    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    ctx.scale(dpr, dpr);
    renderCanvas();
  }

  window.addEventListener('resize', resizeCanvas);

  // --- Render Loop & Canvas Drawing ---
  function renderCanvas() {
    if (!ctx) return;

    // Clear canvas drawing layer (background grid is maintained on background sheet underneath)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 1. Draw all committed shapes history
    for (let i = 0; i < shapesHistory.length; i++) {
      drawShape(ctx, shapesHistory[i]);
    }

    // 2. Draw remote in-progress drafts
    remoteDraftsMap.forEach((draftShape) => {
      drawShape(ctx, draftShape, true);
    });

    // 3. Draw local current drawing draft
    if (isDrawing && currentShape) {
      drawShape(ctx, currentShape, false);
    }
  }

  function drawShape(context, shape, isRemoteDraft = false) {
    if (!shape) return;

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (shape.type === 'eraser') {
      context.globalCompositeOperation = 'destination-out';
      context.lineWidth = shape.width;
      context.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = shape.color;
      context.fillStyle = shape.color;
      context.lineWidth = shape.width;
    }

    if (isRemoteDraft) {
      context.globalAlpha = 0.85;
    }

    switch (shape.type) {
      case 'brush':
      case 'eraser': {
        if (!shape.points || shape.points.length === 0) break;
        context.beginPath();
        context.moveTo(shape.points[0].x, shape.points[0].y);
        
        if (shape.points.length === 1) {
          context.arc(shape.points[0].x, shape.points[0].y, shape.width / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          for (let i = 1; i < shape.points.length - 1; i++) {
            const xc = (shape.points[i].x + shape.points[i + 1].x) / 2;
            const yc = (shape.points[i].y + shape.points[i + 1].y) / 2;
            context.quadraticCurveTo(shape.points[i].x, shape.points[i].y, xc, yc);
          }
          context.lineTo(shape.points[shape.points.length - 1].x, shape.points[shape.points.length - 1].y);
          context.stroke();
        }
        break;
      }
      case 'text': {
        context.font = `600 ${shape.fontSize || 20}px Plus Jakarta Sans, sans-serif`;
        context.textBaseline = 'top';
        context.fillText(shape.text, shape.x, shape.y);
        break;
      }
      default: {
        drawGeometricShape(context, shape);
        break;
      }
    }

    context.restore();
  }

  function drawGeometricShape(context, shape) {
    if (!Number.isFinite(shape.x1) || !Number.isFinite(shape.y1) ||
        !Number.isFinite(shape.x2) || !Number.isFinite(shape.y2)) return;

    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    const w = Math.max(Math.abs(shape.x2 - shape.x1), 1);
    const h = Math.max(Math.abs(shape.y2 - shape.y1), 1);
    const cx = x + w / 2;
    const cy = y + h / 2;

    context.beginPath();

    switch (shape.type) {
      case 'line': {
        context.moveTo(shape.x1, shape.y1);
        context.lineTo(shape.x2, shape.y2);
        context.stroke();
        return;
      }

      case 'rect': {
        context.strokeRect(x, y, w, h);
        return;
      }

      case 'rounded-rect': {
        const r = Math.min(16, w / 4, h / 4);
        if (context.roundRect) {
          context.roundRect(x, y, w, h, r);
        } else {
          context.moveTo(x + r, y);
          context.lineTo(x + w - r, y);
          context.quadraticCurveTo(x + w, y, x + w, y + r);
          context.lineTo(x + w, y + h - r);
          context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          context.lineTo(x + r, y + h);
          context.quadraticCurveTo(x, y + h, x, y + h - r);
          context.lineTo(x, y + r);
          context.quadraticCurveTo(x, y, x + r, y);
        }
        context.stroke();
        return;
      }

      case 'ellipse': {
        context.ellipse(cx, cy, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
        context.stroke();
        return;
      }

      case 'triangle': {
        context.moveTo(cx, y);
        context.lineTo(x + w, y + h);
        context.lineTo(x, y + h);
        context.closePath();
        context.stroke();
        return;
      }

      case 'right-triangle': {
        context.moveTo(x, y);
        context.lineTo(x, y + h);
        context.lineTo(x + w, y + h);
        context.closePath();
        context.stroke();
        return;
      }

      case 'diamond': {
        context.moveTo(cx, y);
        context.lineTo(x + w, cy);
        context.lineTo(cx, y + h);
        context.lineTo(x, cy);
        context.closePath();
        context.stroke();
        return;
      }

      case 'pentagon': {
        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
          const px = cx + (w / 2) * Math.cos(angle);
          const py = cy + (h / 2) * Math.sin(angle);
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.stroke();
        return;
      }

      case 'hexagon': {
        for (let i = 0; i < 6; i++) {
          const angle = (i * 2 * Math.PI / 6) - Math.PI / 2;
          const px = cx + (w / 2) * Math.cos(angle);
          const py = cy + (h / 2) * Math.sin(angle);
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.stroke();
        return;
      }

      case 'octagon': {
        for (let i = 0; i < 8; i++) {
          const angle = (i * 2 * Math.PI / 8) - Math.PI / 8;
          const px = cx + (w / 2) * Math.cos(angle);
          const py = cy + (h / 2) * Math.sin(angle);
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.stroke();
        return;
      }

      case 'star-4': {
        drawStarPath(context, cx, cy, 4, w / 2, h / 2, 0.4);
        context.stroke();
        return;
      }

      case 'star-5': {
        drawStarPath(context, cx, cy, 5, w / 2, h / 2, 0.42);
        context.stroke();
        return;
      }

      case 'star-6': {
        drawStarPath(context, cx, cy, 6, w / 2, h / 2, 0.5);
        context.stroke();
        return;
      }

      case 'arrow-right': {
        const headW = Math.min(w * 0.4, 45);
        const shaftH = h * 0.35;
        const shaftY = cy - shaftH / 2;
        context.moveTo(x, shaftY);
        context.lineTo(x + w - headW, shaftY);
        context.lineTo(x + w - headW, y);
        context.lineTo(x + w, cy);
        context.lineTo(x + w - headW, y + h);
        context.lineTo(x + w - headW, shaftY + shaftH);
        context.lineTo(x, shaftY + shaftH);
        context.closePath();
        context.stroke();
        return;
      }

      case 'arrow-left': {
        const headW = Math.min(w * 0.4, 45);
        const shaftH = h * 0.35;
        const shaftY = cy - shaftH / 2;
        context.moveTo(x + w, shaftY);
        context.lineTo(x + headW, shaftY);
        context.lineTo(x + headW, y);
        context.lineTo(x, cy);
        context.lineTo(x + headW, y + h);
        context.lineTo(x + headW, shaftY + shaftH);
        context.lineTo(x + w, shaftY + shaftH);
        context.closePath();
        context.stroke();
        return;
      }

      case 'arrow-up': {
        const headH = Math.min(h * 0.4, 45);
        const shaftW = w * 0.35;
        const shaftX = cx - shaftW / 2;
        context.moveTo(shaftX, y + h);
        context.lineTo(shaftX, y + headH);
        context.lineTo(x, y + headH);
        context.lineTo(cx, y);
        context.lineTo(x + w, y + headH);
        context.lineTo(shaftX + shaftW, y + headH);
        context.lineTo(shaftX + shaftW, y + h);
        context.closePath();
        context.stroke();
        return;
      }

      case 'arrow-down': {
        const headH = Math.min(h * 0.4, 45);
        const shaftW = w * 0.35;
        const shaftX = cx - shaftW / 2;
        context.moveTo(shaftX, y);
        context.lineTo(shaftX, y + h - headH);
        context.lineTo(x, y + h - headH);
        context.lineTo(cx, y + h);
        context.lineTo(x + w, y + h - headH);
        context.lineTo(shaftX + shaftW, y + h - headH);
        context.lineTo(shaftX + shaftW, y);
        context.closePath();
        context.stroke();
        return;
      }

      case 'arrow-bidirectional': {
        const headW = Math.min(w * 0.28, 35);
        const shaftH = h * 0.35;
        const shaftY = cy - shaftH / 2;
        context.moveTo(x + headW, shaftY);
        context.lineTo(x + w - headW, shaftY);
        context.lineTo(x + w - headW, y);
        context.lineTo(x + w, cy);
        context.lineTo(x + w - headW, y + h);
        context.lineTo(x + w - headW, shaftY + shaftH);
        context.lineTo(x + headW, shaftY + shaftH);
        context.lineTo(x + headW, y + h);
        context.lineTo(x, cy);
        context.lineTo(x + headW, y);
        context.closePath();
        context.stroke();
        return;
      }

      case 'heart': {
        const topCurveHeight = h * 0.3;
        context.moveTo(cx, y + topCurveHeight);
        context.bezierCurveTo(cx, y, x, y, x, y + topCurveHeight);
        context.bezierCurveTo(x, y + (h + topCurveHeight) / 2, cx, y + (h + topCurveHeight) / 2, cx, y + h);
        context.bezierCurveTo(cx, y + (h + topCurveHeight) / 2, x + w, y + (h + topCurveHeight) / 2, x + w, y + topCurveHeight);
        context.bezierCurveTo(x + w, y, cx, y, cx, y + topCurveHeight);
        context.closePath();
        context.stroke();
        return;
      }

      case 'speech-bubble': {
        const r = Math.min(14, w / 5, h / 5);
        const tailH = Math.min(h * 0.25, 24);
        const bubbleH = h - tailH;
        context.moveTo(x + r, y);
        context.lineTo(x + w - r, y);
        context.quadraticCurveTo(x + w, y, x + w, y + r);
        context.lineTo(x + w, y + bubbleH - r);
        context.quadraticCurveTo(x + w, y + bubbleH, x + w - r, y + bubbleH);
        context.lineTo(x + Math.max(w * 0.45, r + 20), y + bubbleH);
        context.lineTo(x + Math.max(w * 0.2, r), y + h);
        context.lineTo(x + Math.max(w * 0.3, r + 10), y + bubbleH);
        context.lineTo(x + r, y + bubbleH);
        context.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - r);
        context.lineTo(x, y + r);
        context.quadraticCurveTo(x, y, x + r, y);
        context.closePath();
        context.stroke();
        return;
      }

      case 'cloud': {
        const r1 = Math.min(w * 0.2, h * 0.28);
        const r2 = Math.min(w * 0.25, h * 0.38);
        const r3 = Math.min(w * 0.22, h * 0.32);
        const r4 = Math.min(w * 0.18, h * 0.26);
        context.moveTo(x + w * 0.2, y + h * 0.85);
        context.lineTo(x + w * 0.8, y + h * 0.85);
        context.arc(x + w * 0.75, y + h * 0.65, r4, Math.PI * 0.5, -Math.PI * 0.2, true);
        context.arc(x + w * 0.6, y + h * 0.45, r3, -Math.PI * 0.2, -Math.PI * 0.7, true);
        context.arc(x + w * 0.38, y + h * 0.4, r2, -Math.PI * 0.7, -Math.PI * 1.2, true);
        context.arc(x + w * 0.22, y + h * 0.65, r1, -Math.PI * 1.2, Math.PI * 0.5, true);
        context.closePath();
        context.stroke();
        return;
      }

      case 'cylinder': {
        const capH = Math.min(h * 0.2, 28);
        context.ellipse(cx, y + capH, w / 2, capH, 0, 0, Math.PI * 2);
        context.stroke();

        context.beginPath();
        context.moveTo(x, y + capH);
        context.lineTo(x, y + h - capH);
        context.ellipse(cx, y + h - capH, w / 2, capH, 0, 0, Math.PI);
        context.lineTo(x + w, y + capH);
        context.stroke();
        return;
      }

      case 'cross': {
        const armW = w / 3;
        const armH = h / 3;
        context.moveTo(cx - armW / 2, y);
        context.lineTo(cx + armW / 2, y);
        context.lineTo(cx + armW / 2, cy - armH / 2);
        context.lineTo(x + w, cy - armH / 2);
        context.lineTo(x + w, cy + armH / 2);
        context.lineTo(cx + armW / 2, cy + armH / 2);
        context.lineTo(cx + armW / 2, y + h);
        context.lineTo(cx - armW / 2, y + h);
        context.lineTo(cx - armW / 2, cy + armH / 2);
        context.lineTo(x, cy + armH / 2);
        context.lineTo(x, cy - armH / 2);
        context.lineTo(cx - armW / 2, cy - armH / 2);
        context.closePath();
        context.stroke();
        return;
      }

      default: {
        context.strokeRect(x, y, w, h);
        return;
      }
    }
  }

  function drawStarPath(ctx, cx, cy, spikes, rx, ry, innerRatio = 0.45) {
    const step = Math.PI / spikes;
    let angle = -Math.PI / 2;
    for (let i = 0; i < spikes * 2; i++) {
      const rX = i % 2 === 0 ? rx : rx * innerRatio;
      const rY = i % 2 === 0 ? ry : ry * innerRatio;
      const px = cx + rX * Math.cos(angle);
      const py = cy + rY * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      angle += step;
    }
    ctx.closePath();
  }

  // --- Mouse & Touch Coordinates ---
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  // --- Event Listeners for Drawing ---
  function handleStart(e) {
    if (!currentRoomCode) return;
    const coords = getCanvasCoords(e);

    if (currentTool === 'text') {
      openTextOverlay(coords.x, coords.y);
      return;
    }

    isDrawing = true;

    if (currentTool === 'brush' || currentTool === 'eraser') {
      currentShape = {
        id: generateId(),
        userId: currentUserId,
        type: currentTool,
        color: currentColor,
        width: currentWidth,
        points: [coords],
      };
    } else if (currentTool === 'shape') {
      currentShape = {
        id: generateId(),
        userId: currentUserId,
        type: currentShapeType,
        color: currentColor,
        width: currentWidth,
        x1: coords.x,
        y1: coords.y,
        x2: coords.x,
        y2: coords.y,
      };
    }

    socket.emit('shape-draft', { shape: currentShape });
    renderCanvas();
  }

  let lastCursorEmit = 0;
  function handleMove(e) {
    if (!currentRoomCode) return;
    const coords = getCanvasCoords(e);

    // Throttle cursor broadcast (30 fps)
    const now = Date.now();
    if (now - lastCursorEmit > 30) {
      socket.emit('cursor-move', { x: coords.x, y: coords.y });
      lastCursorEmit = now;
    }

    if (!isDrawing || !currentShape) return;

    if (currentTool === 'brush' || currentTool === 'eraser') {
      currentShape.points.push(coords);
    } else if (currentTool === 'shape' || currentShape.x1 !== undefined) {
      currentShape.x2 = coords.x;
      currentShape.y2 = coords.y;
    }

    socket.emit('shape-draft', { shape: currentShape });
    renderCanvas();
  }

  function handleEnd() {
    if (!isDrawing || !currentShape) return;

    isDrawing = false;
    shapesHistory.push(currentShape);
    undoStack.push(currentShape.id);
    redoStack.length = 0; // Clear redo stack on new action

    socket.emit('shape-commit', { shape: currentShape });
    currentShape = null;

    updateUndoRedoState();
    renderCanvas();
  }

  canvas.addEventListener('mousedown', handleStart);
  canvas.addEventListener('mousemove', handleMove);
  canvas.addEventListener('mouseup', handleEnd);
  canvas.addEventListener('mouseleave', handleEnd);

  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleStart(e); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e); });
  canvas.addEventListener('touchend', handleEnd);

  // --- Text Tool Handling ---
  function openTextOverlay(x, y) {
    activeTextPosition = { x, y };
    textToolOverlay.style.left = x + 'px';
    textToolOverlay.style.top = y + 'px';
    textToolInput.value = '';
    textToolOverlay.classList.remove('hidden');
    textToolInput.focus();
  }

  function commitText() {
    const textVal = textToolInput.value.trim();
    if (textVal && activeTextPosition) {
      const textShape = {
        id: generateId(),
        userId: currentUserId,
        type: 'text',
        text: textVal,
        x: activeTextPosition.x,
        y: activeTextPosition.y,
        color: currentColor,
        fontSize: Math.max(16, currentWidth * 5),
      };

      shapesHistory.push(textShape);
      undoStack.push(textShape.id);
      redoStack.length = 0;

      socket.emit('shape-commit', { shape: textShape });
      updateUndoRedoState();
      renderCanvas();
    }
    hideTextOverlay();
  }

  function hideTextOverlay() {
    textToolOverlay.classList.add('hidden');
    activeTextPosition = null;
  }

  textToolInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commitText();
    } else if (e.key === 'Escape') {
      hideTextOverlay();
    }
  });

  // --- Undo & Redo Implementation ---
  function handleUndo() {
    if (undoStack.length === 0) return;
    const shapeId = undoStack.pop();
    const shapeIndex = shapesHistory.findIndex(s => s.id === shapeId);
    
    if (shapeIndex !== -1) {
      const undoneShape = shapesHistory[shapeIndex];
      redoStack.push(undoneShape);
      shapesHistory.splice(shapeIndex, 1);
      
      socket.emit('shape-delete', { shapeId });
      updateUndoRedoState();
      renderCanvas();
    }
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const redoneShape = redoStack.pop();
    shapesHistory.push(redoneShape);
    undoStack.push(redoneShape.id);

    socket.emit('shape-commit', { shape: redoneShape });
    updateUndoRedoState();
    renderCanvas();
  }

  function updateUndoRedoState() {
    btnUndo.disabled = undoStack.length === 0;
    btnRedo.disabled = redoStack.length === 0;
  }

  btnUndo.addEventListener('click', handleUndo);
  btnRedo.addEventListener('click', handleRedo);

  // Keyboard Shortcuts (Ctrl+Z / Ctrl+Y)
  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        handleRedo();
      }
    }
  });

  // --- Clear Canvas ---
  btnClear.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the canvas for everyone?')) {
      shapesHistory = [];
      undoStack.length = 0;
      redoStack.length = 0;
      socket.emit('clear');
      updateUndoRedoState();
      renderCanvas();
    }
  });

  // --- Tool & Style Selectors ---
  toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.id === 'tool-shapes') {
        const wasOpen = shapesPopover && !shapesPopover.classList.contains('hidden');
        if (wasOpen) {
          closeShapesPopover();
        } else {
          openShapesPopover();
        }
      } else {
        closeShapesPopover();
      }

      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      hideTextOverlay();
    });
  });

  function openShapesPopover() {
    if (!shapesPopover) return;
    shapesPopover.classList.remove('hidden');
    if (toolShapesBtn) toolShapesBtn.classList.add('popover-open');
  }

  function closeShapesPopover() {
    if (!shapesPopover) return;
    shapesPopover.classList.add('hidden');
    if (toolShapesBtn) toolShapesBtn.classList.remove('popover-open');
  }

  // Close popover when clicking outside
  document.addEventListener('click', (e) => {
    if (shapesPopover && !shapesPopover.classList.contains('hidden')) {
      if (!shapesPopover.contains(e.target) && !toolShapesBtn.contains(e.target)) {
        closeShapesPopover();
      }
    }
  });

  // Shape item selection
  shapeItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const chosenShape = item.dataset.shape;
      currentShapeType = chosenShape;

      // Update active state in popover
      shapeItems.forEach(si => si.classList.remove('active'));
      item.classList.add('active');

      // Update icon in main shapes button
      const svg = item.querySelector('svg');
      if (svg && activeShapeIcon) {
        activeShapeIcon.innerHTML = svg.outerHTML;
      }

      // Activate shapes tool
      toolBtns.forEach(b => b.classList.remove('active'));
      if (toolShapesBtn) toolShapesBtn.classList.add('active');
      currentTool = 'shape';

      closeShapesPopover();
      hideTextOverlay();
    });
  });

  // --- Color & Stroke Helpers (Desktop + Mobile Sync) ---
  function setColor(color) {
    currentColor = color;
    colorSwatches.forEach(s => {
      if (s.dataset.color.toLowerCase() === color.toLowerCase()) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
    mobileSwatches.forEach(s => {
      if (s.dataset.color.toLowerCase() === color.toLowerCase()) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
    if (customColorInput) customColorInput.value = color;
    if (mobileCustomColorInput) mobileCustomColorInput.value = color;
    if (mobileActiveColorDot) mobileActiveColorDot.style.backgroundColor = color;
  }

  function setStrokeWidth(val) {
    currentWidth = parseInt(val, 10);
    if (strokeWidthSlider) strokeWidthSlider.value = currentWidth;
    if (strokeWidthVal) strokeWidthVal.textContent = currentWidth + 'px';
    if (mobileStrokeSlider) mobileStrokeSlider.value = currentWidth;
    if (mobileSliderReadout) mobileSliderReadout.textContent = currentWidth + 'px';
    if (mobileActiveStrokeLabel) mobileActiveStrokeLabel.textContent = currentWidth + 'px';
  }

  // Desktop Swatches & Stroke Listeners
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      setColor(swatch.dataset.color);
    });
  });

  if (customColorInput) {
    customColorInput.addEventListener('input', (e) => {
      setColor(e.target.value);
    });
  }

  if (strokeWidthSlider) {
    strokeWidthSlider.addEventListener('input', (e) => {
      setStrokeWidth(e.target.value);
    });
  }

  // --- Room Join & Create Logic ---
  btnCreateRoom.addEventListener('click', () => {
    const userName = userNameInput.value.trim() || 'Artist';
    localStorage.setItem(USER_NAME_KEY, userName);
    socket.emit('create-room', { userName, clientId: persistentClientId });
  });

  btnJoinRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    const userName = userNameInput.value.trim() || 'Artist';

    if (!code || code.length !== 5) {
      showModalError('Please enter a valid 5-character room code.');
      return;
    }
    localStorage.setItem(USER_NAME_KEY, userName);
    localStorage.setItem(ROOM_CODE_KEY, code);
    socket.emit('join-room', { roomCode: code, userName, clientId: persistentClientId });
  });

  function showModalError(msg) {
    modalErrorMsg.textContent = msg;
    modalErrorMsg.classList.remove('hidden');
  }

  function hideModalError() {
    modalErrorMsg.classList.add('hidden');
  }

  // --- Copy Shareable Link ---
  btnCopyLink.addEventListener('click', () => {
    if (!currentRoomCode) return;
    const shareUrl = `${window.location.origin}/#room=${currentRoomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Share link copied to clipboard!');
    }).catch(() => {
      showToast(`Link: ${shareUrl}`);
    });
  });

  // --- Leave Room (Explicit exit, clears saved session) ---
  function leaveRoom() {
    localStorage.removeItem(ROOM_CODE_KEY);
    window.location.hash = '';
    window.location.reload();
  }

  btnLeaveRoom.addEventListener('click', leaveRoom);
  if (btnMobileLeaveRoom) {
    btnMobileLeaveRoom.addEventListener('click', leaveRoom);
  }

  // --- Scratchpad Layout Management ---
  function applyLayout(layoutKey) {
    if (!layoutKey || !canvasSheet) return;
    currentLayout = layoutKey;

    // Apply layout class to canvas sheet
    canvasSheet.className = `canvas-sheet layout-${layoutKey}`;

    // Update label text in desktop and mobile headers
    const layoutTitle = LAYOUT_NAMES[layoutKey] || layoutKey;
    if (activeLayoutLabel) {
      activeLayoutLabel.textContent = layoutTitle;
    }
    if (mobileLayoutLabel) {
      mobileLayoutLabel.textContent = layoutTitle;
    }

    // Update active highlight on modal cards
    layoutCards.forEach(card => {
      if (card.dataset.layout === layoutKey) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  function updateHostUI() {
    if (hostCrownBadge) {
      if (isHost) {
        hostCrownBadge.classList.remove('hidden');
      } else {
        hostCrownBadge.classList.add('hidden');
      }
    }
    if (mobileHostBadge) {
      if (isHost) {
        mobileHostBadge.classList.remove('hidden');
      } else {
        mobileHostBadge.classList.add('hidden');
      }
    }
    if (btnLayoutPicker) {
      if (isHost) {
        btnLayoutPicker.title = 'Change Scratchpad Layout (Host Control)';
      } else {
        btnLayoutPicker.title = 'Scratchpad Layout (Controlled by Host)';
      }
    }
  }

  // --- Mobile Pop-Outs Logic ---
  function closeAllMobilePopouts() {
    if (mobileHeaderPopout) mobileHeaderPopout.classList.add('hidden');
    if (mobileHeaderBackdrop) mobileHeaderBackdrop.classList.add('hidden');
    if (btnMobileHeaderMenu) btnMobileHeaderMenu.classList.remove('active');

    if (mobileStylePopout) mobileStylePopout.classList.add('hidden');
    if (btnMobileStylePopout) btnMobileStylePopout.classList.remove('active');

    if (mobileMorePopout) mobileMorePopout.classList.add('hidden');
    if (btnMobileMorePopout) btnMobileMorePopout.classList.remove('active');
  }

  // 1. Mobile Header Menu
  if (btnMobileHeaderMenu) {
    btnMobileHeaderMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = mobileHeaderPopout.classList.contains('hidden');
      closeAllMobilePopouts();
      closeShapesPopover();
      if (willOpen) {
        mobileHeaderPopout.classList.remove('hidden');
        if (mobileHeaderBackdrop) mobileHeaderBackdrop.classList.remove('hidden');
        btnMobileHeaderMenu.classList.add('active');
      }
    });
  }

  if (btnCloseMobileHeader) {
    btnCloseMobileHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMobilePopouts();
    });
  }

  if (mobileHeaderBackdrop) {
    mobileHeaderBackdrop.addEventListener('click', () => {
      closeAllMobilePopouts();
    });
  }

  if (btnMobileShareLink) {
    btnMobileShareLink.addEventListener('click', () => {
      if (!currentRoomCode) return;
      const shareUrl = `${window.location.origin}/#room=${currentRoomCode}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Share link copied to clipboard!');
      }).catch(() => {
        showToast(`Link: ${shareUrl}`);
      });
      closeAllMobilePopouts();
    });
  }

  if (btnMobileLayoutPicker) {
    btnMobileLayoutPicker.addEventListener('click', () => {
      closeAllMobilePopouts();
      if (!isHost) {
        showToast('Only the room host can change the scratchpad layout.');
        return;
      }
      if (layoutModalOverlay) {
        layoutModalOverlay.classList.remove('hidden');
      }
    });
  }

  // 2. Mobile Style Pop-out (Color Swatches & Size Slider)
  if (btnMobileStylePopout) {
    btnMobileStylePopout.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = mobileStylePopout.classList.contains('hidden');
      closeAllMobilePopouts();
      closeShapesPopover();
      if (willOpen) {
        mobileStylePopout.classList.remove('hidden');
        btnMobileStylePopout.classList.add('active');
      }
    });
  }

  if (btnCloseMobileStyle) {
    btnCloseMobileStyle.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMobilePopouts();
    });
  }

  mobileSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      setColor(swatch.dataset.color);
    });
  });

  if (mobileCustomColorInput) {
    mobileCustomColorInput.addEventListener('input', (e) => {
      setColor(e.target.value);
    });
  }

  if (mobileStrokeSlider) {
    mobileStrokeSlider.addEventListener('input', (e) => {
      setStrokeWidth(e.target.value);
    });
  }

  // 3. Mobile More Actions Pop-out
  if (btnMobileMorePopout) {
    btnMobileMorePopout.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = mobileMorePopout.classList.contains('hidden');
      closeAllMobilePopouts();
      closeShapesPopover();
      if (willOpen) {
        mobileMorePopout.classList.remove('hidden');
        btnMobileMorePopout.classList.add('active');
      }
    });
  }

  if (btnMobileClear) {
    btnMobileClear.addEventListener('click', () => {
      closeAllMobilePopouts();
      if (shapesHistory.length === 0 && remoteDraftsMap.size === 0) return;
      if (confirm('Clear the entire canvas for everyone in the room?')) {
        socket.emit('clear');
      }
    });
  }

  // Close mobile popouts when clicking outside
  document.addEventListener('click', (e) => {
    if (mobileStylePopout && !mobileStylePopout.classList.contains('hidden')) {
      if (!mobileStylePopout.contains(e.target) && !btnMobileStylePopout.contains(e.target)) {
        mobileStylePopout.classList.add('hidden');
        if (btnMobileStylePopout) btnMobileStylePopout.classList.remove('active');
      }
    }
    if (mobileMorePopout && !mobileMorePopout.classList.contains('hidden')) {
      if (!mobileMorePopout.contains(e.target) && !btnMobileMorePopout.contains(e.target)) {
        mobileMorePopout.classList.add('hidden');
        if (btnMobileMorePopout) btnMobileMorePopout.classList.remove('active');
      }
    }
  });

  // Layout Picker Modal Handlers
  if (btnLayoutPicker) {
    btnLayoutPicker.addEventListener('click', () => {
      if (!isHost) {
        showToast('Only the room host can change the scratchpad layout.');
        return;
      }
      if (layoutModalOverlay) {
        layoutModalOverlay.classList.remove('hidden');
      }
    });
  }

  if (btnCloseLayoutModal) {
    btnCloseLayoutModal.addEventListener('click', () => {
      if (layoutModalOverlay) {
        layoutModalOverlay.classList.add('hidden');
      }
    });
  }

  if (layoutModalOverlay) {
    layoutModalOverlay.addEventListener('click', (e) => {
      if (e.target === layoutModalOverlay) {
        layoutModalOverlay.classList.add('hidden');
      }
    });
  }

  layoutCards.forEach(card => {
    card.addEventListener('click', () => {
      if (!isHost) {
        showToast('Only the room host can change the scratchpad layout.');
        return;
      }
      const selectedLayout = card.dataset.layout;
      if (selectedLayout && selectedLayout !== currentLayout) {
        applyLayout(selectedLayout);
        socket.emit('change-layout', { layout: selectedLayout });
      }
      if (layoutModalOverlay) {
        layoutModalOverlay.classList.add('hidden');
      }
    });
  });

  // --- Collaborative Text Chat Logic ---
  function toggleChat() {
    if (isChatOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    isChatOpen = true;
    if (chatSidebar) chatSidebar.classList.remove('closed');
    if (chatBackdrop) chatBackdrop.classList.add('active');
    if (btnToggleChat) btnToggleChat.classList.add('active');
    unreadChatCount = 0;
    updateUnreadBadges();
    scrollChatToBottom();
    setTimeout(() => {
      if (chatInput) chatInput.focus();
    }, 150);
  }

  function closeChat() {
    isChatOpen = false;
    if (chatSidebar) chatSidebar.classList.add('closed');
    if (chatBackdrop) chatBackdrop.classList.remove('active');
    if (btnToggleChat) btnToggleChat.classList.remove('active');
  }

  function updateUnreadBadges() {
    if (unreadChatCount > 0) {
      const badgeText = unreadChatCount > 99 ? '99+' : unreadChatCount;
      if (chatUnreadBadge) {
        chatUnreadBadge.textContent = badgeText;
        chatUnreadBadge.classList.remove('hidden');
      }
      if (chatFabUnread) {
        chatFabUnread.textContent = badgeText;
        chatFabUnread.classList.remove('hidden');
      }
    } else {
      if (chatUnreadBadge) chatUnreadBadge.classList.add('hidden');
      if (chatFabUnread) chatFabUnread.classList.add('hidden');
    }
  }

  function scrollChatToBottom() {
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function formatChatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderChatMessage(msg, shouldScroll = true) {
    if (!chatMessages) return;

    // Remove empty placeholder if still present
    const emptyPlaceholder = chatMessages.querySelector('.chat-empty-state');
    if (emptyPlaceholder) {
      emptyPlaceholder.remove();
    }

    const isMe = msg.userId === currentUserId;
    const msgItem = document.createElement('div');
    msgItem.className = `chat-message-item ${isMe ? 'msg-me' : 'msg-other'}`;

    const avatarInitial = (msg.userName || 'A').charAt(0).toUpperCase();
    const timeStr = formatChatTime(msg.timestamp);

    msgItem.innerHTML = `
      <div class="chat-msg-avatar" style="background-color: ${msg.userColor || '#38BDF8'};" title="${escapeHtml(msg.userName)}">
        ${avatarInitial}
      </div>
      <div class="chat-msg-body">
        <div class="chat-msg-meta">
          <span class="chat-msg-sender">${isMe ? 'You' : escapeHtml(msg.userName)}</span>
          ${msg.isHost ? '<span class="chat-msg-host-badge" title="Room Host">👑 Host</span>' : ''}
          <span class="chat-msg-time">${timeStr}</span>
        </div>
        <div class="chat-msg-bubble">${escapeHtml(msg.text)}</div>
      </div>
    `;

    chatMessages.appendChild(msgItem);

    if (shouldScroll) {
      scrollChatToBottom();
    }
  }

  // Chat Form Submission
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (!text) return;

      socket.emit('chat-message', { text });
      chatInput.value = '';
    });
  }

  // Chat Open / Close Button Listeners
  if (btnToggleChat) {
    btnToggleChat.addEventListener('click', toggleChat);
  }
  if (btnCloseChat) {
    btnCloseChat.addEventListener('click', closeChat);
  }
  if (chatFab) {
    chatFab.addEventListener('click', toggleChat);
  }
  if (chatBackdrop) {
    chatBackdrop.addEventListener('click', closeChat);
  }

  // Close chat on Escape key if open
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isChatOpen) closeChat();
    }
  });

  // --- Socket Event Handlers ---
  socket.on('room-joined', (data) => {
    currentRoomCode = data.roomCode;
    currentUserId = data.clientId || persistentClientId;
    currentUserInfo = data.userInfo;
    shapesHistory = data.shapes || [];

    // Persist session to survive refresh
    localStorage.setItem(ROOM_CODE_KEY, currentRoomCode);
    if (currentUserInfo && currentUserInfo.name) {
      localStorage.setItem(USER_NAME_KEY, currentUserInfo.name);
    }

    // Host & Layout Initialization
    isHost = !!data.isHost;
    currentHostId = data.hostId;
    if (data.layout) {
      applyLayout(data.layout);
    }
    updateHostUI();

    // Render Room Messages History
    if (Array.isArray(data.messages)) {
      chatMessages.innerHTML = '';
      if (data.messages.length === 0) {
        chatMessages.appendChild(chatEmptyState);
      } else {
        data.messages.forEach(msg => renderChatMessage(msg, false));
        scrollChatToBottom();
      }
    }

    // Clear stacks
    undoStack.length = 0;
    redoStack.length = 0;
    // Populate undoStack with user's past shapes from history
    shapesHistory.forEach(s => {
      if (s.userId === currentUserId || s.userId === data.userId || s.userId === persistentClientId) {
        undoStack.push(s.id);
      }
    });

    hideModalError();
    modalOverlay.classList.add('hidden');
    appWorkspace.classList.remove('hidden');

    roomCodeDisplay.textContent = currentRoomCode;
    window.location.hash = `room=${currentRoomCode}`;

    updateUserList(data.users);
    updateUndoRedoState();

    setTimeout(() => {
      resizeCanvas();
    }, 50);

    showToast(`Welcome to room ${currentRoomCode}!`);
  });

  socket.on('chat-message', (data) => {
    renderChatMessage(data, true);
    if (!isChatOpen) {
      unreadChatCount++;
      updateUnreadBadges();
    }
  });

  socket.on('user-joined', (data) => {
    if (data.hostId) {
      currentHostId = data.hostId;
      isHost = currentUserId === currentHostId;
      updateHostUI();
    }
    updateUserList(data.users);
    showToast(`${data.user.name} joined the room!`);
  });

  socket.on('user-left', (data) => {
    if (data.hostId) {
      currentHostId = data.hostId;
      isHost = currentUserId === currentHostId;
      updateHostUI();
    }
    updateUserList(data.users);
    removeRemoteCursor(data.userId);
    showToast('A collaborator left the room.');
  });

  socket.on('layout-changed', (data) => {
    if (data.layout) {
      applyLayout(data.layout);
      showToast(`Host changed scratchpad layout to ${LAYOUT_NAMES[data.layout] || data.layout}!`);
    }
  });

  socket.on('host-changed', (data) => {
    currentHostId = data.hostId;
    isHost = currentUserId === currentHostId;
    updateHostUI();
    showToast(`${data.hostName || 'A collaborator'} is now room host.`);
  });

  socket.on('shape-draft', (data) => {
    if (data.userId === currentUserId) return;
    remoteDraftsMap.set(data.userId, data.shape);
    renderCanvas();
  });

  socket.on('shape-commit', (data) => {
    remoteDraftsMap.delete(data.shape.userId);
    
    // Prevent duplicate shape push if local
    if (!shapesHistory.some(s => s.id === data.shape.id)) {
      shapesHistory.push(data.shape);
    }
    renderCanvas();
  });

  socket.on('shape-delete', (data) => {
    const idx = shapesHistory.findIndex(s => s.id === data.shapeId);
    if (idx !== -1) {
      shapesHistory.splice(idx, 1);
    }
    renderCanvas();
  });

  socket.on('clear', () => {
    shapesHistory = [];
    remoteDraftsMap.clear();
    undoStack.length = 0;
    redoStack.length = 0;
    updateUndoRedoState();
    renderCanvas();
    showToast('Canvas cleared by host');
  });

  socket.on('cursor-move', (data) => {
    if (data.userId === currentUserId) return;
    updateRemoteCursor(data);
  });

  socket.on('error-msg', (data) => {
    localStorage.removeItem(ROOM_CODE_KEY);
    window.location.hash = '';
    showModalError(data.message);
    if (modalOverlay) modalOverlay.classList.remove('hidden');
    if (appWorkspace) appWorkspace.classList.add('hidden');
  });

  // --- Remote Cursor Rendering ---
  function updateRemoteCursor(data) {
    let cursorEl = remoteCursorsMap.get(data.userId);

    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.className = 'remote-cursor';
      
      cursorEl.innerHTML = `
        <svg class="cursor-pointer" viewBox="0 0 24 24" fill="${data.color}" stroke="#0F172A" stroke-width="1.5">
          <path d="M3 3l7 18 3-7 7-3L3 3z"></path>
        </svg>
        <span class="cursor-label" style="background-color: ${data.color};"></span>
      `;
      remoteCursorsContainer.appendChild(cursorEl);
      remoteCursorsMap.set(data.userId, cursorEl);
    }

    const label = cursorEl.querySelector('.cursor-label');
    if (label) label.textContent = data.name;

    cursorEl.style.transform = `translate3d(${data.x}px, ${data.y}px, 0)`;
  }

  function removeRemoteCursor(userId) {
    const cursorEl = remoteCursorsMap.get(userId);
    if (cursorEl) {
      cursorEl.remove();
      remoteCursorsMap.delete(userId);
    }
  }

  // --- User List & Avatars UI ---
  function updateUserList(users) {
    onlineCount.textContent = `${users.length} Online`;
    userAvatarsList.innerHTML = '';
    if (mobileOnlineCount) mobileOnlineCount.textContent = users.length;
    if (mobileUsersList) mobileUsersList.innerHTML = '';

    users.forEach(user => {
      const isUserHost = user.id === currentHostId;
      const avatar = document.createElement('div');
      avatar.className = `user-avatar ${isUserHost ? 'host-user' : ''}`;
      avatar.style.backgroundColor = user.color;
      avatar.textContent = (user.name || 'A').charAt(0).toUpperCase();
      avatar.title = `${user.name}${user.id === currentUserId ? ' (You)' : ''}${isUserHost ? ' 👑 Host' : ''}`;
      userAvatarsList.appendChild(avatar);

      // Render collaborator row in mobile header popout
      if (mobileUsersList) {
        const item = document.createElement('div');
        item.className = 'mobile-user-item';
        item.innerHTML = `
          <div class="mobile-user-avatar" style="background-color: ${user.color};">${(user.name || 'A').charAt(0).toUpperCase()}</div>
          <span>${escapeHtml(user.name)}${user.id === currentUserId ? ' (You)' : ''}${isUserHost ? ' 👑' : ''}</span>
        `;
        mobileUsersList.appendChild(item);
      }
    });
  }

  // --- Auto-Rejoin on Page Refresh / Deep Link ---
  function tryAutoRejoin() {
    let roomFromHash = null;
    const hash = window.location.hash || '';
    const match = hash.match(/room=([A-Za-z0-9]{5})/i);
    if (match) {
      roomFromHash = match[1].toUpperCase();
    }

    const storedRoom = localStorage.getItem(ROOM_CODE_KEY);
    const targetRoom = roomFromHash || storedRoom;
    const storedName = localStorage.getItem(USER_NAME_KEY) || 'Artist';

    if (targetRoom && targetRoom.length === 5) {
      // Hide modal immediately so refreshing never flashes join/create page
      if (modalOverlay) modalOverlay.classList.add('hidden');
      if (userNameInput) userNameInput.value = storedName;
      if (roomCodeInput) roomCodeInput.value = targetRoom;

      socket.emit('join-room', {
        roomCode: targetRoom,
        userName: storedName,
        clientId: persistentClientId,
      });
    } else {
      if (userNameInput && storedName) {
        userNameInput.value = storedName;
      }
      if (modalOverlay) {
        modalOverlay.classList.remove('hidden');
      }
    }
  }

  // Attempt auto-rejoin immediately upon connection or script execution
  if (socket.connected) {
    tryAutoRejoin();
  } else {
    socket.once('connect', () => {
      if (!currentRoomCode) {
        tryAutoRejoin();
      }
    });
  }

})();
