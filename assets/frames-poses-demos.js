(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function radians(degrees) {
    return degrees * Math.PI / 180;
  }

  function degrees(radiansValue) {
    return radiansValue * 180 / Math.PI;
  }

  function formatNumber(value, digits) {
    return Number(value).toFixed(digits);
  }

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

  function transform2d(x, y, thetaDegrees) {
    const theta = radians(thetaDegrees);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [
      [c, -s, x],
      [s, c, y],
      [0, 0, 1]
    ];
  }

  function multiply(a, b) {
    return a.map(function (row, rowIndex) {
      return b[0].map(function (_, columnIndex) {
        return row.reduce(function (sum, value, innerIndex) {
          return sum + value * b[innerIndex][columnIndex];
        }, 0);
      });
    });
  }

  function applyTransform(transform, point) {
    return [
      transform[0][0] * point[0] + transform[0][1] * point[1] + transform[0][2],
      transform[1][0] * point[0] + transform[1][1] * point[1] + transform[1][2]
    ];
  }

  function poseFromTransform(transform) {
    return {
      x: transform[0][2],
      y: transform[1][2],
      theta: degrees(Math.atan2(transform[1][0], transform[0][0]))
    };
  }

  function buildReadoutRow(label, value) {
    return "<div class=\"frames-readout__row\"><dt>" + label + "</dt><dd>" + value + "</dd></div>";
  }

  function initializePoseChainDemo(root) {
    const view = {
      width: 620,
      height: 420,
      originX: 90,
      originY: 330,
      scale: 1.35
    };
    const state = {
      step: "target",
      camera: { x: 120, y: 105, theta: 30 },
      part: { x: 130, y: 40, theta: -45 },
      grasp: { x: 55, y: 0, theta: 0 }
    };

    root.innerHTML = [
      "<div class=\"frames-demo__stage\">",
      "<svg class=\"frames-svg\" viewBox=\"0 0 " + view.width + " " + view.height + "\" role=\"img\" aria-label=\"Frame transform chain from camera observation to robot base target\"></svg>",
      "</div>",
      "<div class=\"frames-demo__panel\">",
      "<div class=\"frames-demo__buttons\" aria-label=\"Select transform chain step\">",
      "<button type=\"button\" data-step=\"camera\">1 Camera calibration</button>",
      "<button type=\"button\" data-step=\"part\">2 Vision result</button>",
      "<button type=\"button\" data-step=\"grasp\">3 Grasp offset</button>",
      "<button type=\"button\" data-step=\"target\">4 Robot target</button>",
      "</div>",
      "<div class=\"frames-demo__sliders\">",
      sliderMarkup("Detected part x", "part-x", 80, 170, state.part.x, "mm"),
      sliderMarkup("Detected part y", "part-y", -10, 85, state.part.y, "mm"),
      sliderMarkup("Detected part angle", "part-theta", -90, 45, state.part.theta, "deg"),
      "</div>",
      "<div class=\"frames-equation\" aria-live=\"polite\"></div>",
      "<dl class=\"frames-readout\"></dl>",
      "</div>"
    ].join("");

    const svg = root.querySelector("svg");
    const buttons = Array.from(root.querySelectorAll("button[data-step]"));
    const equation = root.querySelector(".frames-equation");
    const readout = root.querySelector(".frames-readout");
    const partXInput = root.querySelector("input[data-role='part-x']");
    const partYInput = root.querySelector("input[data-role='part-y']");
    const partThetaInput = root.querySelector("input[data-role='part-theta']");
    const sliderValues = Array.from(root.querySelectorAll(".frames-slider__value"));

    function sliderMarkup(label, role, min, max, value, unit) {
      return [
        "<label class=\"frames-slider\">",
        "<span class=\"frames-slider__header\"><span>" + label + "</span><span class=\"frames-slider__value\" data-value-for=\"" + role + "\"></span></span>",
        "<input type=\"range\" min=\"" + min + "\" max=\"" + max + "\" step=\"1\" value=\"" + value + "\" data-role=\"" + role + "\" data-unit=\"" + unit + "\">",
        "</label>"
      ].join("");
    }

    function toSvg(point) {
      return [
        view.originX + point[0] * view.scale,
        view.originY - point[1] * view.scale
      ];
    }

    function currentTransforms() {
      const tBaseCamera = transform2d(state.camera.x, state.camera.y, state.camera.theta);
      const tCameraPart = transform2d(state.part.x, state.part.y, state.part.theta);
      const tPartTcp = transform2d(state.grasp.x, state.grasp.y, state.grasp.theta);
      const tBasePart = multiply(tBaseCamera, tCameraPart);
      const tBaseTcp = multiply(tBasePart, tPartTcp);

      return {
        tBaseCamera: tBaseCamera,
        tCameraPart: tCameraPart,
        tPartTcp: tPartTcp,
        tBasePart: tBasePart,
        tBaseTcp: tBaseTcp
      };
    }

    function drawGrid() {
      const group = createSvgElement("g", { class: "frames-svg__grid" });

      for (let x = 0; x <= 360; x += 50) {
        const start = toSvg([x, -80]);
        const end = toSvg([x, 240]);
        group.appendChild(createSvgElement("line", {
          x1: start[0],
          y1: start[1],
          x2: end[0],
          y2: end[1]
        }));
      }

      for (let y = -50; y <= 240; y += 50) {
        const start = toSvg([-40, y]);
        const end = toSvg([370, y]);
        group.appendChild(createSvgElement("line", {
          x1: start[0],
          y1: start[1],
          x2: end[0],
          y2: end[1]
        }));
      }

      const xAxis = [toSvg([-35, 0]), toSvg([375, 0])];
      const yAxis = [toSvg([0, -70]), toSvg([0, 245])];
      group.appendChild(createSvgElement("line", {
        x1: xAxis[0][0],
        y1: xAxis[0][1],
        x2: xAxis[1][0],
        y2: xAxis[1][1],
        class: "frames-svg__axis"
      }));
      group.appendChild(createSvgElement("line", {
        x1: yAxis[0][0],
        y1: yAxis[0][1],
        x2: yAxis[1][0],
        y2: yAxis[1][1],
        class: "frames-svg__axis"
      }));

      svg.appendChild(group);
    }

    function drawTransformArrow(start, end, className, label) {
      const startSvg = toSvg(start);
      const endSvg = toSvg(end);
      const midpoint = [
        (startSvg[0] + endSvg[0]) / 2,
        (startSvg[1] + endSvg[1]) / 2
      ];
      const group = createSvgElement("g", { class: className });
      group.appendChild(createSvgElement("path", {
        d: "M " + startSvg[0].toFixed(1) + " " + startSvg[1].toFixed(1) + " L " + endSvg[0].toFixed(1) + " " + endSvg[1].toFixed(1),
        class: "frames-svg__transform-line"
      }));
      group.appendChild(createSvgElement("circle", {
        cx: endSvg[0],
        cy: endSvg[1],
        r: 4,
        class: "frames-svg__transform-end"
      }));
      group.appendChild(createSvgElement("text", {
        x: midpoint[0] + 8,
        y: midpoint[1] - 8,
        class: "frames-svg__transform-label"
      }));
      group.lastChild.textContent = label;
      svg.appendChild(group);
    }

    function drawFrame(transform, label, className, options) {
      const origin = applyTransform(transform, [0, 0]);
      const xEnd = applyTransform(transform, [42, 0]);
      const yEnd = applyTransform(transform, [0, 42]);
      const originSvg = toSvg(origin);
      const xSvg = toSvg(xEnd);
      const ySvg = toSvg(yEnd);
      const group = createSvgElement("g", { class: className + (options && options.active ? " is-active" : "") });

      group.appendChild(createSvgElement("line", {
        x1: originSvg[0],
        y1: originSvg[1],
        x2: xSvg[0],
        y2: xSvg[1],
        class: "frames-svg__frame-axis frames-svg__frame-axis--x"
      }));
      group.appendChild(createSvgElement("line", {
        x1: originSvg[0],
        y1: originSvg[1],
        x2: ySvg[0],
        y2: ySvg[1],
        class: "frames-svg__frame-axis frames-svg__frame-axis--y"
      }));
      group.appendChild(createSvgElement("circle", {
        cx: originSvg[0],
        cy: originSvg[1],
        r: 5,
        class: "frames-svg__frame-origin"
      }));
      group.appendChild(createSvgElement("text", {
        x: originSvg[0] + 8,
        y: originSvg[1] - 10,
        class: "frames-svg__frame-label"
      }));
      group.lastChild.textContent = label;
      svg.appendChild(group);
    }

    function drawPart(tBasePart) {
      const corners = [
        [-28, -18],
        [28, -18],
        [28, 18],
        [-28, 18]
      ].map(function (point) {
        return toSvg(applyTransform(tBasePart, point));
      });
      const polygon = createSvgElement("polygon", {
        points: corners.map(function (point) { return point[0].toFixed(1) + "," + point[1].toFixed(1); }).join(" "),
        class: "frames-svg__part"
      });
      svg.appendChild(polygon);
    }

    function drawTool(tBaseTcp) {
      const points = [
        [0, -10],
        [32, 0],
        [0, 10]
      ].map(function (point) {
        return toSvg(applyTransform(tBaseTcp, point));
      });
      svg.appendChild(createSvgElement("polygon", {
        points: points.map(function (point) { return point[0].toFixed(1) + "," + point[1].toFixed(1); }).join(" "),
        class: "frames-svg__tool"
      }));
    }

    function updateSliders() {
      sliderValues.forEach(function (valueElement) {
        const input = root.querySelector("input[data-role='" + valueElement.dataset.valueFor + "']");
        const suffix = input.dataset.unit === "deg" ? " deg" : " mm";
        valueElement.textContent = input.value + suffix;
      });
    }

    function renderEquation(targetPose) {
      function term(id, label) {
        return "<span class=\"frames-equation__term" + (state.step === id || state.step === "target" ? " is-active" : "") + "\">" + label + "</span>";
      }

      equation.innerHTML = [
        "<div class=\"frames-equation__main\">",
        term("target", "T_base_tcp"),
        " = ",
        term("camera", "T_base_camera"),
        " @ ",
        term("part", "T_camera_part"),
        " @ ",
        term("grasp", "T_part_tcp"),
        "</div>",
        "<div class=\"frames-equation__result\">",
        "T_base_tcp = (x ",
        formatNumber(targetPose.x, 1),
        " mm, y ",
        formatNumber(targetPose.y, 1),
        " mm, theta ",
        formatNumber(targetPose.theta, 1),
        " deg)",
        "</div>"
      ].join("");
    }

    function renderReadout(transforms) {
      const cameraPose = poseFromTransform(transforms.tBaseCamera);
      const partInCamera = state.part;
      const tcpPose = poseFromTransform(transforms.tBaseTcp);

      readout.innerHTML = [
        buildReadoutRow("Base to camera", formatPose(cameraPose)),
        buildReadoutRow("Camera to part", formatPose(partInCamera)),
        buildReadoutRow("Part to TCP", formatPose(state.grasp)),
        buildReadoutRow("Base to TCP", formatPose(tcpPose))
      ].join("");
    }

    function formatPose(pose) {
      return "x " + formatNumber(pose.x, 0) + ", y " + formatNumber(pose.y, 0) + ", theta " + formatNumber(pose.theta, 0);
    }

    function render() {
      const transforms = currentTransforms();
      const base = [0, 0];
      const camera = applyTransform(transforms.tBaseCamera, [0, 0]);
      const part = applyTransform(transforms.tBasePart, [0, 0]);
      const tcp = applyTransform(transforms.tBaseTcp, [0, 0]);
      const targetPose = poseFromTransform(transforms.tBaseTcp);

      clear(svg);
      drawGrid();
      drawTransformArrow(base, camera, "frames-svg__transform frames-svg__transform--camera" + (state.step === "camera" || state.step === "target" ? " is-active" : ""), "T_base_camera");
      drawTransformArrow(camera, part, "frames-svg__transform frames-svg__transform--part" + (state.step === "part" || state.step === "target" ? " is-active" : ""), "T_camera_part");
      drawTransformArrow(part, tcp, "frames-svg__transform frames-svg__transform--grasp" + (state.step === "grasp" || state.step === "target" ? " is-active" : ""), "T_part_tcp");
      drawTransformArrow(base, tcp, "frames-svg__transform frames-svg__transform--target" + (state.step === "target" ? " is-active" : ""), "T_base_tcp");
      drawPart(transforms.tBasePart);
      drawTool(transforms.tBaseTcp);
      drawFrame(transform2d(0, 0, 0), "base", "frames-svg__frame frames-svg__frame--base", { active: state.step === "target" });
      drawFrame(transforms.tBaseCamera, "camera", "frames-svg__frame frames-svg__frame--camera", { active: state.step === "camera" });
      drawFrame(transforms.tBasePart, "part", "frames-svg__frame frames-svg__frame--part", { active: state.step === "part" });
      drawFrame(transforms.tBaseTcp, "TCP goal", "frames-svg__frame frames-svg__frame--tcp", { active: state.step === "grasp" || state.step === "target" });

      buttons.forEach(function (button) {
        button.classList.toggle("is-active", button.dataset.step === state.step);
      });
      updateSliders();
      renderEquation(targetPose);
      renderReadout(transforms);
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.step = button.dataset.step;
        render();
      });
    });

    [partXInput, partYInput, partThetaInput].forEach(function (input) {
      input.addEventListener("input", function () {
        state.part.x = Number(partXInput.value);
        state.part.y = Number(partYInput.value);
        state.part.theta = Number(partThetaInput.value);
        render();
      });
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", function () {
    const root = document.getElementById("frames-pose-chain-demo");
    if (root) {
      initializePoseChainDemo(root);
    }
  });
})();
