(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const steps = [
    {
      id: "camera",
      label: "Camera calibration",
      description: "Known from calibration: camera frame relative to robot base.",
      equationFocus: ["camera"]
    },
    {
      id: "part",
      label: "Vision result",
      description: "Measured by vision: part frame relative to camera.",
      equationFocus: ["part"]
    },
    {
      id: "grasp",
      label: "Taught offset",
      description: "Taught once: required TCP frame relative to the part.",
      equationFocus: ["grasp"]
    },
    {
      id: "target",
      label: "Robot target",
      description: "Combined result: TCP target expressed in robot base.",
      equationFocus: ["target"]
    }
  ];
  const colors = {
    camera: "#1d4f8e",
    part: "#2a9d8f",
    grasp: "#c2410c",
    target: "#111827"
  };

  function createSvgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function ([key, value]) {
      element.setAttribute(key, value);
    });
    return element;
  }

  function clear(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function typesetMath(element, attempt) {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([element]);
    } else if (attempt < 10) {
      window.setTimeout(function () {
        typesetMath(element, attempt + 1);
      }, 100);
    }
  }

  function initializeTransform2dDemo(root) {
    const colors = {
      x: "#1d4f8e",
      y: "#2a9d8f",
      theta: "#c2410c",
      translation: "#7c2d12"
    };
    const state = {
      x: 1.2,
      y: 0.8,
      theta: 35,
      direction: "ab"
    };
    const sliders = [
      { id: "x", label: "x position", min: -2.4, max: 2.4, step: 0.1 },
      { id: "y", label: "y position", min: -1.6, max: 1.6, step: 0.1 },
      { id: "theta", label: "theta rotation", min: -180, max: 180, step: 5 }
    ];
    const plot = {
      width: 680,
      height: 420,
      originX: 315,
      originY: 250,
      scale: 112
    };

    root.innerHTML = [
      "<div class=\"frames-demo__stage\">",
      "<svg class=\"frames-transform-svg\" viewBox=\"0 0 680 420\" role=\"img\" aria-label=\"2D homogeneous transform with a fixed reference frame and a moving local frame\"></svg>",
      "</div>",
      "<div class=\"frames-demo__panel\">",
      "<div class=\"frames-demo__buttons frames-transform-direction\" aria-label=\"Select pose direction\">",
      "<button type=\"button\" data-direction=\"ab\">A -> B</button>",
      "<button type=\"button\" data-direction=\"ba\">B -> A</button>",
      "</div>",
      "<div class=\"frames-demo__sliders\">",
      sliders.map(function (slider) {
        return [
          "<label class=\"frames-slider frames-transform-slider--" + slider.id + "\" data-parameter=\"" + slider.id + "\">",
          "<span class=\"frames-slider__header\"><span>" + slider.label + "</span><span class=\"frames-slider__value\" data-value=\"" + slider.id + "\"></span></span>",
          "<input type=\"range\" min=\"" + slider.min + "\" max=\"" + slider.max + "\" step=\"" + slider.step + "\" value=\"" + state[slider.id] + "\" aria-label=\"" + slider.label + "\">",
          "</label>"
        ].join("");
      }).join(""),
      "</div>",
      "<button type=\"button\" class=\"frames-demo__play\" data-role=\"reset\">Reset pose</button>",
      "<p class=\"frames-demo__status\" aria-live=\"polite\"></p>",
      "</div>",
      "<div class=\"frames-equation frames-transform-equation\" aria-live=\"polite\"></div>"
    ].join("");

    const svg = root.querySelector("svg");
    const equation = root.querySelector(".frames-transform-equation");
    const resetButton = root.querySelector("button[data-role='reset']");
    const status = root.querySelector(".frames-demo__status");
    const directionButtons = Array.from(root.querySelectorAll("button[data-direction]"));
    const inputs = {};
    const valueLabels = {};

    sliders.forEach(function (slider) {
      const control = root.querySelector("[data-parameter='" + slider.id + "']");
      inputs[slider.id] = control.querySelector("input");
      valueLabels[slider.id] = control.querySelector("[data-value]");
    });

    function worldToSvg(x, y) {
      return {
        x: plot.originX + x * plot.scale,
        y: plot.originY - y * plot.scale
      };
    }

    function appendLine(parent, x1, y1, x2, y2, className, markerEnd) {
      const p1 = worldToSvg(x1, y1);
      const p2 = worldToSvg(x2, y2);
      const line = createSvgElement("line", {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        class: className
      });
      if (markerEnd) {
        line.setAttribute("marker-end", markerEnd);
      }
      parent.appendChild(line);
      return line;
    }

    function appendText(parent, text, x, y, className) {
      const point = worldToSvg(x, y);
      const label = createSvgElement("text", {
        x: point.x,
        y: point.y,
        class: className
      });
      label.textContent = text;
      parent.appendChild(label);
      return label;
    }

    function drawMarkerDefinitions() {
      const defs = createSvgElement("defs");
      [
        ["x", colors.x],
        ["y", colors.y],
        ["theta", colors.theta],
        ["translation", colors.translation]
      ].forEach(function (entry) {
        const marker = createSvgElement("marker", {
          id: "frames-transform-arrow-" + entry[0],
          markerWidth: 9,
          markerHeight: 9,
          refX: 7,
          refY: 3,
          orient: "auto",
          markerUnits: "strokeWidth"
        });
        marker.appendChild(createSvgElement("path", {
          d: "M 0 0 L 7 3 L 0 6 z",
          fill: entry[1]
        }));
        defs.appendChild(marker);
      });
      svg.appendChild(defs);
    }

    function drawGrid() {
      const grid = createSvgElement("g", { class: "frames-transform__grid" });
      for (let x = -3; x <= 3.001; x += 0.5) {
        appendLine(grid, x, -2, x, 2, Math.abs(x) < 0.001 ? "frames-transform__grid-axis" : "");
      }
      for (let y = -2; y <= 2.001; y += 0.5) {
        appendLine(grid, -3, y, 3, y, Math.abs(y) < 0.001 ? "frames-transform__grid-axis" : "");
      }
      svg.appendChild(grid);
    }

    function drawFrame(parent, name, x, y, thetaRad, axisLength, labelOffsetY) {
      const origin = worldToSvg(x, y);
      const group = createSvgElement("g", { class: "frames-transform__frame frames-transform__frame--" + name });
      const xEnd = {
        x: x + axisLength * Math.cos(thetaRad),
        y: y + axisLength * Math.sin(thetaRad)
      };
      const yEnd = {
        x: x - axisLength * Math.sin(thetaRad),
        y: y + axisLength * Math.cos(thetaRad)
      };
      appendLine(group, x, y, xEnd.x, xEnd.y, "frames-transform__frame-axis frames-transform__frame-axis--x", "url(#frames-transform-arrow-x)");
      appendLine(group, x, y, yEnd.x, yEnd.y, "frames-transform__frame-axis frames-transform__frame-axis--y", "url(#frames-transform-arrow-y)");
      group.appendChild(createSvgElement("circle", {
        cx: origin.x,
        cy: origin.y,
        r: name === "a" ? 5 : 6,
        class: "frames-transform__origin"
      }));
      appendText(group, "x_" + name.toUpperCase(), xEnd.x + 0.12, xEnd.y - 0.05, "frames-transform__axis-label frames-transform__axis-label--x");
      appendText(group, "y_" + name.toUpperCase(), yEnd.x + 0.06, yEnd.y + 0.12, "frames-transform__axis-label frames-transform__axis-label--y");
      appendText(group, "frame " + name.toUpperCase(), x + 0.08, y + labelOffsetY, "frames-transform__frame-label");
      parent.appendChild(group);
    }

    function appendTransformLabel(parent, x, y, fromFrame, toFrame) {
      const point = worldToSvg(x, y);
      const label = createSvgElement("text", {
        x: point.x,
        y: point.y,
        class: "frames-transform__pose-label"
      });
      const superscript = createSvgElement("tspan", {
        class: "frames-transform__pose-label-sup",
        "baseline-shift": "super"
      });
      superscript.textContent = fromFrame;
      const main = createSvgElement("tspan");
      main.textContent = "T";
      const subscript = createSvgElement("tspan", {
        class: "frames-transform__pose-label-sub",
        "baseline-shift": "sub"
      });
      subscript.textContent = toFrame;
      label.appendChild(superscript);
      label.appendChild(main);
      label.appendChild(subscript);
      parent.appendChild(label);
      return label;
    }

    function drawThetaArc(thetaRad) {
      if (Math.abs(thetaRad) < 0.04) {
        return;
      }
      const center = worldToSvg(state.x, state.y);
      const radius = 42;
      const start = { x: center.x + radius, y: center.y };
      const end = {
        x: center.x + radius * Math.cos(thetaRad),
        y: center.y - radius * Math.sin(thetaRad)
      };
      const largeArc = Math.abs(thetaRad) > Math.PI ? 1 : 0;
      const sweep = thetaRad > 0 ? 0 : 1;
      const path = createSvgElement("path", {
        d: "M " + start.x + " " + start.y + " A " + radius + " " + radius + " 0 " + largeArc + " " + sweep + " " + end.x + " " + end.y,
        class: "frames-transform__theta-arc",
        "marker-end": "url(#frames-transform-arrow-theta)"
      });
      svg.appendChild(path);
      const midAngle = thetaRad / 2;
      const labelPoint = {
        x: center.x + (radius + 20) * Math.cos(midAngle),
        y: center.y - (radius + 20) * Math.sin(midAngle)
      };
      const label = createSvgElement("text", {
        x: labelPoint.x,
        y: labelPoint.y,
        class: "frames-transform__theta-label"
      });
      label.textContent = "theta";
      svg.appendChild(label);
    }

    function formatNumber(value) {
      const clean = Math.abs(value) < 0.0001 ? 0 : value;
      return clean.toFixed(1);
    }

    function formatDegree(value) {
      const clean = Math.abs(value) < 0.0001 ? 0 : value;
      return Math.round(clean).toString();
    }

    function colorTex(id, tex) {
      return "\\color{" + colors[id] + "}{" + tex + "}";
    }

    function inversePose() {
      const thetaRad = state.theta * Math.PI / 180;
      const c = Math.cos(thetaRad);
      const s = Math.sin(thetaRad);
      return {
        x: -(c * state.x + s * state.y),
        y: s * state.x - c * state.y,
        theta: -state.theta
      };
    }

    function renderEquation() {
      const thetaValue = colorTex("theta", formatDegree(state.theta) + "^{\\circ}");
      const xValue = colorTex("x", formatNumber(state.x));
      const yValue = colorTex("y", formatNumber(state.y));
      const inverse = inversePose();
      const inverseThetaValue = colorTex("theta", formatDegree(inverse.theta) + "^{\\circ}");
      const inverseXValue = colorTex("x", formatNumber(inverse.x));
      const inverseYValue = colorTex("y", formatNumber(inverse.y));
      const equationTex = state.direction === "ab" ? [
        "\\[",
        "{}^{A}T_B =",
        "\\begin{bmatrix}",
        "\\cos(" + thetaValue + ") & -\\sin(" + thetaValue + ") & " + xValue + " \\\\",
        "\\sin(" + thetaValue + ") & \\cos(" + thetaValue + ") & " + yValue + " \\\\",
        "0 & 0 & 1",
        "\\end{bmatrix}",
        "\\]"
      ].join("\n") : [
        "\\[",
        "{}^{B}T_A = \\left({}^{A}T_B\\right)^{-1} =",
        "\\begin{bmatrix}",
        "\\cos(" + inverseThetaValue + ") & -\\sin(" + inverseThetaValue + ") & " + inverseXValue + " \\\\",
        "\\sin(" + inverseThetaValue + ") & \\cos(" + inverseThetaValue + ") & " + inverseYValue + " \\\\",
        "0 & 0 & 1",
        "\\end{bmatrix}",
        "\\]"
      ].join("\n");
      equation.innerHTML = "<div class=\"frames-equation__math\">" + equationTex + "</div>";
      typesetMath(equation, 0);
    }

    function updateControls() {
      valueLabels.x.textContent = formatNumber(state.x);
      valueLabels.y.textContent = formatNumber(state.y);
      valueLabels.theta.textContent = formatDegree(state.theta) + "\u00b0";
    }

    function render() {
      clear(svg);
      drawMarkerDefinitions();
      drawGrid();

      const thetaRad = state.theta * Math.PI / 180;
      const helperGroup = createSvgElement("g", { class: "frames-transform__helpers" });
      if (Math.abs(state.x) > 0.001) {
        appendLine(helperGroup, 0, 0, state.x, 0, "frames-transform__projection frames-transform__projection--x");
        appendText(helperGroup, "x", state.x / 2, -0.08, "frames-transform__component-label frames-transform__component-label--x");
      }
      if (Math.abs(state.y) > 0.001) {
        appendLine(helperGroup, state.x, 0, state.x, state.y, "frames-transform__projection frames-transform__projection--y");
        appendText(helperGroup, "y", state.x + 0.08, state.y / 2, "frames-transform__component-label frames-transform__component-label--y");
      }
      const poseDistance = Math.hypot(state.x, state.y);
      if (poseDistance > 0.05) {
        const labelOffsetX = -state.y / poseDistance * 0.18;
        const labelOffsetY = state.x / poseDistance * 0.18;
        if (state.direction === "ab") {
          appendLine(helperGroup, 0, 0, state.x, state.y, "frames-transform__translation", "url(#frames-transform-arrow-translation)");
          appendTransformLabel(helperGroup, state.x / 2 + labelOffsetX, state.y / 2 + labelOffsetY, "A", "B");
        } else {
          appendLine(helperGroup, state.x, state.y, 0, 0, "frames-transform__translation frames-transform__translation--inverse", "url(#frames-transform-arrow-translation)");
          appendTransformLabel(helperGroup, state.x / 2 + labelOffsetX, state.y / 2 + labelOffsetY, "B", "A");
        }
      }
      svg.appendChild(helperGroup);

      drawFrame(svg, "a", 0, 0, 0, 1.35, -0.22);
      appendLine(svg, state.x, state.y, state.x + 0.95, state.y, "frames-transform__theta-reference");
      drawFrame(svg, "b", state.x, state.y, thetaRad, 1.05, 0.42);
      drawThetaArc(thetaRad);
      directionButtons.forEach(function (button) {
        button.classList.toggle("is-active", button.getAttribute("data-direction") === state.direction);
      });
      status.textContent = state.direction === "ab" ?
        "Showing the pose of frame B expressed in frame A." :
        "Showing the inverse pose: frame A expressed in frame B.";
      updateControls();
      renderEquation();
    }

    Object.keys(inputs).forEach(function (id) {
      inputs[id].addEventListener("input", function () {
        state[id] = Number(inputs[id].value);
        render();
      });
    });

    directionButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.direction = button.getAttribute("data-direction");
        render();
      });
    });

    resetButton.addEventListener("click", function () {
      state.x = 1.2;
      state.y = 0.8;
      state.theta = 35;
      state.direction = "ab";
      Object.keys(inputs).forEach(function (id) {
        inputs[id].value = state[id];
      });
      render();
    });

    render();
  }
  function initializePoseChainDemo(root) {
    const nodes = {
      base: { x: 110, y: 178, label: "robot base", shortLabel: "B" },
      camera: { x: 560, y: 92, label: "camera", shortLabel: "C" },
      part: { x: 420, y: 165, label: "workpiece", shortLabel: "P" },
      tcp: { x: 315, y: 70, label: "TCP", shortLabel: "E" }
    };
    const edgeDefinitions = [
      {
        id: "camera",
        from: "base",
        to: "camera",
        label: "base to camera",
        path: "M 132 195 C 235 300, 455 300, 548 115"
      },
      {
        id: "part",
        from: "camera",
        to: "part",
        label: "camera to part",
        path: "M 540 115 C 500 120, 460 145, 440 158"
      },
      {
        id: "grasp",
        from: "part",
        to: "tcp",
        label: "part to TCP",
        path: "M 397 148 C 365 130, 333 103, 315 94"
      },
      {
        id: "target",
        from: "base",
        to: "tcp",
        label: "base to TCP result",
        path: "M 127 158 C 148 78, 235 42, 290 62"
      }
    ];
    const state = {
      stepIndex: 0,
      playing: true
    };
    let intervalId = null;

    root.innerHTML = [
      "<div class=\"frames-demo__stage\">",
      "<svg class=\"frames-svg\" viewBox=\"0 0 680 320\" role=\"img\" aria-label=\"Pose graph showing a chain of coordinate transforms\"></svg>",
      "</div>",
      "<div class=\"frames-demo__panel\">",
      "<div class=\"frames-demo__buttons\" aria-label=\"Select transform chain step\">",
      steps.map(function (step, index) {
        return "<button type=\"button\" data-step-index=\"" + index + "\">" + (index + 1) + " " + step.label + "</button>";
      }).join(""),
      "</div>",
      "<button type=\"button\" class=\"frames-demo__play\" data-role=\"toggle\">Pause animation</button>",
      "<p class=\"frames-demo__status\" aria-live=\"polite\"></p>",
      "</div>",
      "<div class=\"frames-equation\" aria-live=\"polite\"></div>"
    ].join("");

    const svg = root.querySelector("svg");
    const buttons = Array.from(root.querySelectorAll("button[data-step-index]"));
    const toggleButton = root.querySelector("button[data-role='toggle']");
    const status = root.querySelector(".frames-demo__status");
    const equation = root.querySelector(".frames-equation");

    function currentStep() {
      return steps[state.stepIndex];
    }

    function isEdgeActive(edgeId) {
      const step = currentStep();
      if (step.id === "target") {
        return edgeId === "target";
      }
      return edgeId === step.id;
    }

    function isNodeActive(nodeId) {
      const edge = edgeDefinitions.find(function (definition) {
        return isEdgeActive(definition.id);
      });
      return edge && (edge.from === nodeId || edge.to === nodeId);
    }

    function drawMarkerDefinitions() {
      const defs = createSvgElement("defs");
      Object.entries(colors).forEach(function ([id, color]) {
        const marker = createSvgElement("marker", {
          id: "frames-arrow-" + id,
          markerWidth: 10,
          markerHeight: 10,
          refX: 8,
          refY: 3,
          orient: "auto",
          markerUnits: "strokeWidth"
        });
        marker.appendChild(createSvgElement("path", {
          d: "M 0 0 L 8 3 L 0 6 z",
          fill: color
        }));
        defs.appendChild(marker);
      });
      const mutedMarker = createSvgElement("marker", {
        id: "frames-arrow-muted",
        markerWidth: 10,
        markerHeight: 10,
        refX: 8,
        refY: 3,
        orient: "auto",
        markerUnits: "strokeWidth"
      });
      mutedMarker.appendChild(createSvgElement("path", {
        d: "M 0 0 L 8 3 L 0 6 z",
        fill: "rgba(86, 101, 120, 0.55)"
      }));
      defs.appendChild(mutedMarker);
      svg.appendChild(defs);
    }

    function drawEdge(edge) {
      const active = isEdgeActive(edge.id);
      const group = createSvgElement("g", {
        class: "frames-graph__edge frames-graph__edge--" + edge.id + (active ? " is-active" : ""),
        style: "--edge-color: " + colors[edge.id]
      });
      group.appendChild(createSvgElement("path", {
        d: edge.path,
        class: "frames-graph__edge-line",
        "marker-end": active ? "url(#frames-arrow-" + edge.id + ")" : "url(#frames-arrow-muted)"
      }));
      group.appendChild(createSvgElement("text", {
        class: "frames-graph__edge-label"
      }));
      group.lastChild.appendChild(createSvgElement("textPath", {
        href: "#frames-edge-path-" + edge.id,
        startOffset: "50%"
      }));

      const labelPath = createSvgElement("path", {
        id: "frames-edge-path-" + edge.id,
        d: edge.path,
        fill: "none",
        stroke: "none"
      });
      group.insertBefore(labelPath, group.firstChild);
      group.lastChild.firstChild.textContent = edge.label;
      svg.appendChild(group);
    }

    function drawNode(id) {
      const node = nodes[id];
      const active = isNodeActive(id);
      const group = createSvgElement("g", {
        class: "frames-graph__node frames-graph__node--" + id + (active ? " is-active" : "")
      });
      group.appendChild(createSvgElement("circle", {
        cx: node.x,
        cy: node.y,
        r: 35,
        class: "frames-graph__node-circle"
      }));
      const shortLabel = createSvgElement("text", {
        x: node.x,
        y: node.y + 7,
        class: "frames-graph__node-symbol"
      });
      shortLabel.textContent = node.shortLabel;
      group.appendChild(shortLabel);
      const label = createSvgElement("text", {
        x: node.x,
        y: node.y + 55,
        class: "frames-graph__node-label"
      });
      label.textContent = node.label;
      group.appendChild(label);
      svg.appendChild(group);
    }

    function mathTerm(id, tex) {
      const active = currentStep().equationFocus.indexOf(id) !== -1;
      const color = colors[id];
      return active ?
        "\\color{" + color + "}{\\mathbf{" + tex + "}}" :
        "\\color{" + color + "}{" + tex + "}";
    }

    function renderEquation() {
      const equationTex = [
        "\\[",
        mathTerm("target", "{}^{base}T_{tcp}"),
        " = ",
        mathTerm("camera", "{}^{base}T_{camera}"),
        "\\;",
        mathTerm("part", "{}^{camera}T_{part}"),
        "\\;",
        mathTerm("grasp", "{}^{part}T_{tcp}"),
        "\\]"
      ].join("");
      equation.innerHTML = "<div class=\"frames-equation__math\">" + equationTex + "</div>";
      typesetMath(equation, 0);
    }

    function render() {
      clear(svg);
      drawMarkerDefinitions();
      edgeDefinitions.forEach(drawEdge);
      ["base", "camera", "part", "tcp"].forEach(drawNode);

      buttons.forEach(function (button, index) {
        button.classList.toggle("is-active", index === state.stepIndex);
      });
      toggleButton.textContent = state.playing ? "Pause animation" : "Play animation";
      status.textContent = currentStep().description;
      renderEquation();
    }

    function stopAnimation() {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    function startAnimation() {
      stopAnimation();
      intervalId = window.setInterval(function () {
        state.stepIndex = (state.stepIndex + 1) % steps.length;
        render();
      }, 2400);
    }

    buttons.forEach(function (button, index) {
      button.addEventListener("click", function () {
        state.stepIndex = index;
        render();
        if (state.playing) {
          startAnimation();
        }
      });
    });

    toggleButton.addEventListener("click", function () {
      state.playing = !state.playing;
      if (state.playing) {
        startAnimation();
      } else {
        stopAnimation();
      }
      render();
    });

    render();
    startAnimation();
  }

  document.addEventListener("DOMContentLoaded", function () {
    const transformRoot = document.getElementById("frames-transform-2d-demo");
    if (transformRoot) {
      initializeTransform2dDemo(transformRoot);
    }

    const chainRoot = document.getElementById("frames-pose-chain-demo");
    if (chainRoot) {
      initializePoseChainDemo(chainRoot);
    }
  });
})();
