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
    const root = document.getElementById("frames-pose-chain-demo");
    if (root) {
      initializePoseChainDemo(root);
    }
  });
})();
