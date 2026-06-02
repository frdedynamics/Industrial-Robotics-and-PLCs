(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function createSvgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function ([key, value]) {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function clear(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function radians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function degrees(radiansValue) {
    return (radiansValue * 180) / Math.PI;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function wrapDegrees(value) {
    let wrapped = value;
    while (wrapped > 180) {
      wrapped -= 360;
    }
    while (wrapped < -180) {
      wrapped += 360;
    }
    return wrapped;
  }

  function formatNumber(value, digits) {
    const rounded = Number(value).toFixed(digits);
    return value >= 0 ? "+" + rounded : rounded;
  }

  function forwardKinematics(angles, lengths) {
    let theta = 0;
    let x = 0;
    let y = 0;
    const points = [[0, 0]];

    lengths.forEach(function (length, index) {
      theta += radians(angles[index] || 0);
      x += length * Math.cos(theta);
      y += length * Math.sin(theta);
      points.push([x, y]);
    });

    return {
      points: points,
      orientation: degrees(theta)
    };
  }

  function inverseKinematics3R(target, phiDegrees, elbowMode, lengths) {
    const phi = radians(phiDegrees);
    const wrist = [
      target[0] - lengths[2] * Math.cos(phi),
      target[1] - lengths[2] * Math.sin(phi)
    ];
    const l1 = lengths[0];
    const l2 = lengths[1];
    const distanceSquared = (wrist[0] * wrist[0]) + (wrist[1] * wrist[1]);
    const distance = Math.sqrt(distanceSquared);
    const minReach = Math.abs(l1 - l2);
    const maxReach = l1 + l2;
    const reachable = distance <= maxReach && distance >= minReach;
    const cosQ2 = clamp((distanceSquared - (l1 * l1) - (l2 * l2)) / (2 * l1 * l2), -1, 1);
    const q2Sign = elbowMode === "up" ? -1 : 1;
    const q2 = q2Sign * Math.acos(cosQ2);
    const q1 = Math.atan2(wrist[1], wrist[0]) - Math.atan2(l2 * Math.sin(q2), l1 + l2 * Math.cos(q2));
    const q3 = phi - q1 - q2;

    return {
      angles: [degrees(q1), degrees(q2), degrees(q3)].map(wrapDegrees),
      reachable: reachable,
      wrist: wrist,
      distance: distance,
      minReach: minReach,
      maxReach: maxReach
    };
  }

  function createCoordinateSystem(width, height) {
    return {
      width: width,
      height: height,
      originX: width / 2,
      originY: height * 0.7
    };
  }

  function toSvg(point, coordinates) {
    return [
      coordinates.originX + point[0],
      coordinates.originY - point[1]
    ];
  }

  function fromSvg(point, coordinates) {
    return [
      point[0] - coordinates.originX,
      coordinates.originY - point[1]
    ];
  }

  function drawGrid(svg, coordinates, reach) {
    const group = createSvgElement("g", { class: "kinematics-svg__grid" });
    const step = 50;

    for (let x = coordinates.originX % step; x <= coordinates.width; x += step) {
      group.appendChild(createSvgElement("line", {
        x1: x,
        y1: 0,
        x2: x,
        y2: coordinates.height
      }));
    }

    for (let y = coordinates.originY % step; y <= coordinates.height; y += step) {
      group.appendChild(createSvgElement("line", {
        x1: 0,
        y1: y,
        x2: coordinates.width,
        y2: y
      }));
    }

    for (let y = coordinates.originY - step; y >= 0; y -= step) {
      group.appendChild(createSvgElement("line", {
        x1: 0,
        y1: y,
        x2: coordinates.width,
        y2: y
      }));
    }

    group.appendChild(createSvgElement("line", {
      x1: 0,
      y1: coordinates.originY,
      x2: coordinates.width,
      y2: coordinates.originY,
      class: "kinematics-svg__axis"
    }));

    group.appendChild(createSvgElement("line", {
      x1: coordinates.originX,
      y1: 0,
      x2: coordinates.originX,
      y2: coordinates.height,
      class: "kinematics-svg__axis"
    }));

    group.appendChild(createSvgElement("circle", {
      cx: coordinates.originX,
      cy: coordinates.originY,
      r: reach,
      class: "kinematics-svg__workspace"
    }));

    svg.appendChild(group);
  }

  function drawArm(svg, points, coordinates, options) {
    const armGroup = createSvgElement("g", { class: "kinematics-svg__arm" });
    const polylinePoints = points.map(function (point) {
      const svgPoint = toSvg(point, coordinates);
      return svgPoint[0] + "," + svgPoint[1];
    }).join(" ");

    armGroup.appendChild(createSvgElement("polyline", {
      points: polylinePoints,
      class: "kinematics-svg__link-path"
    }));

    points.forEach(function (point, index) {
      const svgPoint = toSvg(point, coordinates);
      armGroup.appendChild(createSvgElement("circle", {
        cx: svgPoint[0],
        cy: svgPoint[1],
        r: index === points.length - 1 ? 7 : 6,
        class: index === points.length - 1 ? "kinematics-svg__tcp" : "kinematics-svg__joint"
      }));
    });

    const tcp = points[points.length - 1];
    const phi = radians(options.orientationDegrees || 0);
    const start = toSvg(tcp, coordinates);
    const end = toSvg([
      tcp[0] + 32 * Math.cos(phi),
      tcp[1] + 32 * Math.sin(phi)
    ], coordinates);

    armGroup.appendChild(createSvgElement("line", {
      x1: start[0],
      y1: start[1],
      x2: end[0],
      y2: end[1],
      class: "kinematics-svg__tool-axis"
    }));

    svg.appendChild(armGroup);
  }

  function drawPath(svg, samples, coordinates, className) {
    if (samples.length < 2) {
      return;
    }
    const points = samples.map(function (point) {
      const svgPoint = toSvg(point, coordinates);
      return svgPoint[0] + "," + svgPoint[1];
    }).join(" ");

    svg.appendChild(createSvgElement("polyline", {
      points: points,
      class: className
    }));
  }

  function svgPointFromEvent(svg, event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
    return [transformed.x, transformed.y];
  }

  function buildReadoutRow(label, value) {
    return "<div class=\"kinematics-readout__row\"><dt>" + label + "</dt><dd>" + value + "</dd></div>";
  }

  function initializeForwardDemo(root) {
    const lengths = [115, 90, 65];
    const coordinates = createCoordinateSystem(520, 360);
    const state = {
      activeJoints: 3,
      angles: [25, 45, -35]
    };

    root.innerHTML = [
      "<div class=\"kinematics-demo__stage\">",
      "<svg class=\"kinematics-svg\" viewBox=\"0 0 520 360\" role=\"img\" aria-label=\"Forward kinematics demo\"></svg>",
      "</div>",
      "<div class=\"kinematics-demo__panel\">",
      "<div class=\"kinematics-demo__buttons\" aria-label=\"Select number of joints\">",
      "<button type=\"button\" data-joints=\"1\">1 joint</button>",
      "<button type=\"button\" data-joints=\"2\">2 joints</button>",
      "<button type=\"button\" data-joints=\"3\">3 joints</button>",
      "</div>",
      "<div class=\"kinematics-demo__sliders\"></div>",
      "<dl class=\"kinematics-readout\"></dl>",
      "</div>"
    ].join("");

    const svg = root.querySelector("svg");
    const buttons = Array.from(root.querySelectorAll("button[data-joints]"));
    const slidersRoot = root.querySelector(".kinematics-demo__sliders");
    const readout = root.querySelector(".kinematics-readout");
    const sliderValues = [];
    const sliderInputs = [];

    state.angles.forEach(function (angle, index) {
      const wrapper = document.createElement("label");
      wrapper.className = "kinematics-slider";
      wrapper.innerHTML = [
        "<span class=\"kinematics-slider__header\">",
        "<span>q" + (index + 1) + "</span>",
        "<span class=\"kinematics-slider__value\"></span>",
        "</span>",
        "<input type=\"range\" min=\"-170\" max=\"170\" step=\"1\">"
      ].join("");
      const input = wrapper.querySelector("input");
      const value = wrapper.querySelector(".kinematics-slider__value");
      input.value = String(angle);
      input.addEventListener("input", function () {
        state.angles[index] = Number(input.value);
        render();
      });
      sliderValues.push(value);
      sliderInputs.push(input);
      slidersRoot.appendChild(wrapper);
    });

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.activeJoints = Number(button.dataset.joints);
        render();
      });
    });

    function render() {
      const activeLengths = lengths.slice(0, state.activeJoints);
      const activeAngles = state.angles.slice(0, state.activeJoints);
      const result = forwardKinematics(activeAngles, activeLengths);
      const tcp = result.points[result.points.length - 1];

      clear(svg);
      drawGrid(svg, coordinates, lengths.reduce(function (sum, value) { return sum + value; }, 0));
      drawArm(svg, result.points, coordinates, { orientationDegrees: result.orientation });

      sliderInputs.forEach(function (input, index) {
        input.disabled = index >= state.activeJoints;
        sliderValues[index].textContent = formatNumber(state.angles[index], 0) + " deg";
      });

      buttons.forEach(function (button) {
        button.classList.toggle("is-active", Number(button.dataset.joints) === state.activeJoints);
      });

      readout.innerHTML = [
        buildReadoutRow("TCP x", formatNumber(tcp[0], 1)),
        buildReadoutRow("TCP y", formatNumber(tcp[1], 1)),
        buildReadoutRow("TCP angle", formatNumber(result.orientation, 1) + " deg")
      ].join("");
    }

    render();
  }

  function initializeInverseDemo(root) {
    const lengths = [115, 90, 45];
    const coordinates = createCoordinateSystem(520, 360);
    const state = {
      target: [150, 90],
      phi: 20,
      elbowMode: "down",
      dragging: false
    };

    root.innerHTML = [
      "<div class=\"kinematics-demo__stage\">",
      "<svg class=\"kinematics-svg\" viewBox=\"0 0 520 360\" role=\"img\" aria-label=\"Inverse kinematics demo\"></svg>",
      "</div>",
      "<div class=\"kinematics-demo__panel\">",
      "<div class=\"kinematics-demo__buttons\" aria-label=\"Select inverse kinematics branch\">",
      "<button type=\"button\" data-elbow=\"down\">Elbow down</button>",
      "<button type=\"button\" data-elbow=\"up\">Elbow up</button>",
      "</div>",
      "<label class=\"kinematics-slider\">",
      "<span class=\"kinematics-slider__header\"><span>Tool angle</span><span class=\"kinematics-slider__value\"></span></span>",
      "<input type=\"range\" min=\"-160\" max=\"160\" step=\"1\" value=\"20\" data-role=\"phi\">",
      "</label>",
      "<dl class=\"kinematics-readout\"></dl>",
      "<p class=\"kinematics-demo__hint\">Drag the target point in the plot.</p>",
      "</div>"
    ].join("");

    const svg = root.querySelector("svg");
    const buttons = Array.from(root.querySelectorAll("button[data-elbow]"));
    const phiInput = root.querySelector("input[data-role='phi']");
    const phiValue = root.querySelector(".kinematics-slider__value");
    const readout = root.querySelector(".kinematics-readout");

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.elbowMode = button.dataset.elbow;
        render();
      });
    });

    phiInput.addEventListener("input", function () {
      state.phi = Number(phiInput.value);
      render();
    });

    svg.addEventListener("pointerdown", function (event) {
      state.dragging = true;
      svg.setPointerCapture(event.pointerId);
      updateTargetFromEvent(event);
    });

    svg.addEventListener("pointermove", function (event) {
      if (state.dragging) {
        updateTargetFromEvent(event);
      }
    });

    svg.addEventListener("pointerup", function (event) {
      state.dragging = false;
      if (svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }
    });

    svg.addEventListener("pointerleave", function () {
      state.dragging = false;
    });

    function updateTargetFromEvent(event) {
      const svgPoint = svgPointFromEvent(svg, event);
      const worldPoint = fromSvg(svgPoint, coordinates);
      const maxRadius = 245;
      const radius = Math.hypot(worldPoint[0], worldPoint[1]);
      if (radius > maxRadius) {
        state.target = [
          (worldPoint[0] / radius) * maxRadius,
          (worldPoint[1] / radius) * maxRadius
        ];
      } else {
        state.target = worldPoint;
      }
      render();
    }

    function drawTarget(solution) {
      const targetSvg = toSvg(state.target, coordinates);
      const targetGroup = createSvgElement("g", {
        class: solution.reachable ? "kinematics-svg__target" : "kinematics-svg__target is-unreachable"
      });

      targetGroup.appendChild(createSvgElement("circle", {
        cx: targetSvg[0],
        cy: targetSvg[1],
        r: 10
      }));
      targetGroup.appendChild(createSvgElement("line", {
        x1: targetSvg[0] - 16,
        y1: targetSvg[1],
        x2: targetSvg[0] + 16,
        y2: targetSvg[1]
      }));
      targetGroup.appendChild(createSvgElement("line", {
        x1: targetSvg[0],
        y1: targetSvg[1] - 16,
        x2: targetSvg[0],
        y2: targetSvg[1] + 16
      }));

      const phi = radians(state.phi);
      const directionEnd = toSvg([
        state.target[0] + 38 * Math.cos(phi),
        state.target[1] + 38 * Math.sin(phi)
      ], coordinates);
      targetGroup.appendChild(createSvgElement("line", {
        x1: targetSvg[0],
        y1: targetSvg[1],
        x2: directionEnd[0],
        y2: directionEnd[1],
        class: "kinematics-svg__target-axis"
      }));

      svg.appendChild(targetGroup);
    }

    function render() {
      const solution = inverseKinematics3R(state.target, state.phi, state.elbowMode, lengths);
      const result = forwardKinematics(solution.angles, lengths);
      const tcp = result.points[result.points.length - 1];
      const wristSvg = toSvg(solution.wrist, coordinates);

      clear(svg);
      drawGrid(svg, coordinates, lengths.reduce(function (sum, value) { return sum + value; }, 0));
      svg.appendChild(createSvgElement("circle", {
        cx: wristSvg[0],
        cy: wristSvg[1],
        r: 4,
        class: "kinematics-svg__wrist-center"
      }));
      drawArm(svg, result.points, coordinates, { orientationDegrees: result.orientation });
      drawTarget(solution);

      buttons.forEach(function (button) {
        button.classList.toggle("is-active", button.dataset.elbow === state.elbowMode);
      });
      phiValue.textContent = formatNumber(state.phi, 0) + " deg";

      readout.innerHTML = [
        buildReadoutRow("q1", formatNumber(solution.angles[0], 1) + " deg"),
        buildReadoutRow("q2", formatNumber(solution.angles[1], 1) + " deg"),
        buildReadoutRow("q3", formatNumber(solution.angles[2], 1) + " deg"),
        buildReadoutRow("TCP error", Math.hypot(tcp[0] - state.target[0], tcp[1] - state.target[1]).toFixed(1)),
        buildReadoutRow("Status", solution.reachable ? "reachable" : "outside reach")
      ].join("");
    }

    render();
  }

  function initializeMotionDemo(root) {
    const lengths = [115, 90, 45];
    const coordinates = createCoordinateSystem(520, 360);
    const startPose = { target: [245, 42], phi: 0 };
    const endPose = { target: [245, -42], phi: 0 };
    const elbowMode = "down";
    const startSolution = inverseKinematics3R(startPose.target, startPose.phi, elbowMode, lengths);
    const endSolution = inverseKinematics3R(endPose.target, endPose.phi, elbowMode, lengths);
    const state = {
      mode: "movel",
      progress: 0.5
    };

    root.innerHTML = [
      "<div class=\"kinematics-demo__stage\">",
      "<svg class=\"kinematics-svg\" viewBox=\"0 0 520 360\" role=\"img\" aria-label=\"Joint and linear motion comparison\"></svg>",
      "</div>",
      "<div class=\"kinematics-demo__panel\">",
      "<div class=\"kinematics-demo__buttons\" aria-label=\"Select motion type\">",
      "<button type=\"button\" data-mode=\"movej\">MoveJ / PTP</button>",
      "<button type=\"button\" data-mode=\"movel\">MoveL / LIN</button>",
      "</div>",
      "<label class=\"kinematics-slider\">",
      "<span class=\"kinematics-slider__header\"><span>Motion progress</span><span class=\"kinematics-slider__value\"></span></span>",
      "<input type=\"range\" min=\"0\" max=\"100\" step=\"1\" value=\"50\" data-role=\"progress\">",
      "</label>",
      "<dl class=\"kinematics-readout\"></dl>",
      "<div class=\"kinematics-health\"><span class=\"kinematics-health__fill\"></span></div>",
      "</div>"
    ].join("");

    const svg = root.querySelector("svg");
    const buttons = Array.from(root.querySelectorAll("button[data-mode]"));
    const progressInput = root.querySelector("input[data-role='progress']");
    const progressValue = root.querySelector(".kinematics-slider__value");
    const readout = root.querySelector(".kinematics-readout");
    const healthFill = root.querySelector(".kinematics-health__fill");

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        state.mode = button.dataset.mode;
        render();
      });
    });

    progressInput.addEventListener("input", function () {
      state.progress = Number(progressInput.value) / 100;
      render();
    });

    function interpolate(a, b, t) {
      return a + ((b - a) * t);
    }

    function interpolateAngles(startAngles, endAngles, t) {
      return startAngles.map(function (angle, index) {
        return interpolate(angle, endAngles[index], t);
      });
    }

    function poseAtLinear(t) {
      return {
        target: [
          interpolate(startPose.target[0], endPose.target[0], t),
          interpolate(startPose.target[1], endPose.target[1], t)
        ],
        phi: interpolate(startPose.phi, endPose.phi, t)
      };
    }

    function anglesAtProgress(t) {
      if (state.mode === "movej") {
        return interpolateAngles(startSolution.angles, endSolution.angles, t);
      }

      const pose = poseAtLinear(t);
      return inverseKinematics3R(pose.target, pose.phi, elbowMode, lengths).angles;
    }

    function tcpPathSamples(mode) {
      const samples = [];
      for (let i = 0; i <= 80; i += 1) {
        const t = i / 80;
        if (mode === "movej") {
          const result = forwardKinematics(interpolateAngles(startSolution.angles, endSolution.angles, t), lengths);
          samples.push(result.points[result.points.length - 1]);
        } else {
          samples.push(poseAtLinear(t).target);
        }
      }
      return samples;
    }

    function singularityMargin(angles) {
      return Math.abs(Math.sin(radians(angles[1])));
    }

    function relativeJointMotion(t) {
      const step = 0.01;
      const low = clamp(t - step, 0, 1);
      const high = clamp(t + step, 0, 1);
      const lowAngles = anglesAtProgress(low);
      const highAngles = anglesAtProgress(high);
      const delta = Math.sqrt(lowAngles.reduce(function (sum, angle, index) {
        const diff = wrapDegrees(highAngles[index] - angle);
        return sum + (diff * diff);
      }, 0));
      return delta / Math.max(high - low, 0.001);
    }

    function drawMarkers() {
      [
        { label: "Start", point: startPose.target },
        { label: "End", point: endPose.target }
      ].forEach(function (marker) {
        const svgPoint = toSvg(marker.point, coordinates);
        const group = createSvgElement("g", { class: "kinematics-svg__motion-marker" });
        group.appendChild(createSvgElement("circle", {
          cx: svgPoint[0],
          cy: svgPoint[1],
          r: 6
        }));
        group.appendChild(createSvgElement("text", {
          x: svgPoint[0] + 10,
          y: svgPoint[1] - 8
        }));
        group.lastChild.textContent = marker.label;
        svg.appendChild(group);
      });
    }

    function render() {
      const angles = anglesAtProgress(state.progress);
      const result = forwardKinematics(angles, lengths);
      const tcp = result.points[result.points.length - 1];
      const margin = singularityMargin(angles);
      const motion = relativeJointMotion(state.progress);
      const healthPercent = Math.round(clamp(margin, 0, 1) * 100);

      clear(svg);
      drawGrid(svg, coordinates, lengths.reduce(function (sum, value) { return sum + value; }, 0));
      drawPath(svg, tcpPathSamples("movel"), coordinates, "kinematics-svg__path-line");
      drawPath(svg, tcpPathSamples("movej"), coordinates, "kinematics-svg__path-joint");
      drawArm(svg, result.points, coordinates, { orientationDegrees: result.orientation });
      drawMarkers();

      buttons.forEach(function (button) {
        button.classList.toggle("is-active", button.dataset.mode === state.mode);
      });
      progressValue.textContent = Math.round(state.progress * 100) + "%";
      healthFill.style.width = healthPercent + "%";
      healthFill.classList.toggle("is-warning", margin < 0.22);

      readout.innerHTML = [
        buildReadoutRow("Active motion", state.mode === "movej" ? "MoveJ / PTP" : "MoveL / LIN"),
        buildReadoutRow("TCP x", formatNumber(tcp[0], 1)),
        buildReadoutRow("TCP y", formatNumber(tcp[1], 1)),
        buildReadoutRow("q2", formatNumber(angles[1], 1) + " deg"),
        buildReadoutRow("Singularity margin", margin < 0.22 ? "low" : "acceptable"),
        buildReadoutRow("Relative joint motion", motion.toFixed(0) + " deg per path")
      ].join("");
    }

    render();
  }

  function initializeAll() {
    const fkRoot = document.getElementById("kinematics-fk-demo");
    const ikRoot = document.getElementById("kinematics-ik-demo");
    const motionRoot = document.getElementById("kinematics-motion-demo");

    if (fkRoot) {
      initializeForwardDemo(fkRoot);
    }
    if (ikRoot) {
      initializeInverseDemo(ikRoot);
    }
    if (motionRoot) {
      initializeMotionDemo(motionRoot);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAll);
  } else {
    initializeAll();
  }
})();
