(function () {
  const widgetRoot = document.getElementById("robot-kinematics-widget");

  if (!widgetRoot) {
    return;
  }

  const plotRoot = document.getElementById("robot-plot");
  const slidersRoot = document.getElementById("robot-sliders");
  const jointReadoutRoot = document.getElementById("robot-joint-readout");
  const poseReadoutRoot = document.getElementById("robot-pose-readout");
  const presetButtons = Array.from(document.querySelectorAll(".robot-preset"));

  if (typeof Plotly === "undefined") {
    plotRoot.innerHTML = "<p class=\"robot-widget__fallback\">The robot preview could not load because Plotly.js is unavailable.</p>";
    return;
  }

  const jointDefinitions = [
    { label: "J1 Base", min: -180, max: 180, value: 0 },
    { label: "J2 Shoulder", min: -120, max: 120, value: -30 },
    { label: "J3 Elbow", min: -150, max: 150, value: 75 },
    { label: "J4 Wrist Roll", min: -180, max: 180, value: -120 },
    { label: "J5 Wrist Pitch", min: -120, max: 120, value: -90 },
    { label: "J6 Tool Yaw", min: -180, max: 180, value: 0 }
  ];

  const presets = {
    home: [0, -30, 75, -120, -90, 0]
  };

  const dhParameters = [
    { a: 0.0, alpha: Math.PI / 2, d: 0.36 },
    { a: 0.34, alpha: 0, d: 0.0 },
    { a: 0.28, alpha: 0, d: 0.0 },
    { a: 0.0, alpha: Math.PI / 2, d: 0.16 },
    { a: 0.0, alpha: -Math.PI / 2, d: 0.12 },
    { a: 0.0, alpha: 0, d: 0.11 }
  ];

  const state = {
    angles: jointDefinitions.map((joint) => joint.value),
    trail: [],
    animationFrame: null
  };

  const sliderInputs = [];
  const sliderValues = [];

  function identityMatrix() {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  function multiplyMatrices(left, right) {
    const result = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];

    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        let value = 0;
        for (let index = 0; index < 4; index += 1) {
          value += left[row][index] * right[index][column];
        }
        result[row][column] = value;
      }
    }

    return result;
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function dhTransform(theta, d, a, alpha) {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosAlpha = Math.cos(alpha);
    const sinAlpha = Math.sin(alpha);

    return [
      [cosTheta, -sinTheta * cosAlpha, sinTheta * sinAlpha, a * cosTheta],
      [sinTheta, cosTheta * cosAlpha, -cosTheta * sinAlpha, a * sinTheta],
      [0, sinAlpha, cosAlpha, d],
      [0, 0, 0, 1]
    ];
  }

  function formatSigned(value, digits) {
    const rounded = value.toFixed(digits);
    return value >= 0 ? "+" + rounded : rounded;
  }

  function rotationToEuler(transform) {
    const r11 = transform[0][0];
    const r21 = transform[1][0];
    const r31 = transform[2][0];
    const r32 = transform[2][1];
    const r33 = transform[2][2];

    const yaw = Math.atan2(r21, r11);
    const pitch = Math.atan2(-r31, Math.sqrt((r11 * r11) + (r21 * r21)));
    const roll = Math.atan2(r32, r33);

    return {
      roll: radiansToDegrees(roll),
      pitch: radiansToDegrees(pitch),
      yaw: radiansToDegrees(yaw)
    };
  }

  function forwardKinematics(angles) {
    let transform = identityMatrix();
    const origins = [[0, 0, 0]];

    dhParameters.forEach((parameter, index) => {
      transform = multiplyMatrices(
        transform,
        dhTransform(degreesToRadians(angles[index]), parameter.d, parameter.a, parameter.alpha)
      );
      origins.push([transform[0][3], transform[1][3], transform[2][3]]);
    });

    return {
      origins,
      transform,
      pose: rotationToEuler(transform)
    };
  }

  function createTrace(points, color, name) {
    return {
      type: "scatter3d",
      mode: "lines",
      name,
      x: points.map((point) => point[0]),
      y: points.map((point) => point[1]),
      z: points.map((point) => point[2]),
      line: {
        color,
        width: 8
      },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function createAxisTrace(origin, direction, color, name) {
    const scale = 0.1;
    const end = [
      origin[0] + (direction[0] * scale),
      origin[1] + (direction[1] * scale),
      origin[2] + (direction[2] * scale)
    ];

    return {
      type: "scatter3d",
      mode: "lines",
      name,
      x: [origin[0], end[0]],
      y: [origin[1], end[1]],
      z: [origin[2], end[2]],
      line: {
        color,
        width: 6
      },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function createWorkspaceRing() {
    const points = [];
    const radius = 0.85;

    for (let step = 0; step <= 120; step += 1) {
      const angle = (step / 120) * Math.PI * 2;
      points.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
    }

    return {
      type: "scatter3d",
      mode: "lines",
      x: points.map((point) => point[0]),
      y: points.map((point) => point[1]),
      z: points.map((point) => point[2]),
      line: {
        color: "rgba(39, 128, 227, 0.25)",
        width: 3,
        dash: "dot"
      },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function createGroundPlaneTrace() {
    const extent = 0.9;
    const step = 0.1;
    const axis = [];

    for (let value = -extent; value <= extent + 1e-9; value += step) {
      axis.push(Number(value.toFixed(2)));
    }

    const z = axis.map(function () {
      return axis.map(function () {
        return 0;
      });
    });

    return {
      type: "surface",
      x: axis,
      y: axis,
      z: z,
      opacity: 0.16,
      showscale: false,
      hoverinfo: "skip",
      colorscale: [
        [0, "#f6fbff"],
        [1, "#dbe9f8"]
      ],
      contours: {
        x: {
          show: true,
          start: -extent,
          end: extent,
          size: step,
          color: "rgba(39, 128, 227, 0.20)",
          width: 1,
          highlight: false
        },
        y: {
          show: true,
          start: -extent,
          end: extent,
          size: step,
          color: "rgba(39, 128, 227, 0.20)",
          width: 1,
          highlight: false
        },
        z: {
          show: false
        }
      },
      lighting: {
        ambient: 1,
        diffuse: 0.4,
        specular: 0
      }
    };
  }

  function createDropLineTrace(point) {
    return {
      type: "scatter3d",
      mode: "lines",
      x: [point[0], point[0]],
      y: [point[1], point[1]],
      z: [0, point[2]],
      line: {
        color: "rgba(255, 127, 80, 0.4)",
        width: 4,
        dash: "dot"
      },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function updateTrail(endEffectorPoint) {
    const previous = state.trail[state.trail.length - 1];

    if (!previous) {
      state.trail.push(endEffectorPoint);
      return;
    }

    const delta = Math.hypot(
      endEffectorPoint[0] - previous[0],
      endEffectorPoint[1] - previous[1],
      endEffectorPoint[2] - previous[2]
    );

    if (delta > 0.008) {
      state.trail.push(endEffectorPoint);
    }

    if (state.trail.length > 90) {
      state.trail.shift();
    }
  }

  function createTrailTrace() {
    if (state.trail.length < 2) {
      return null;
    }

    return {
      type: "scatter3d",
      mode: "lines",
      x: state.trail.map((point) => point[0]),
      y: state.trail.map((point) => point[1]),
      z: state.trail.map((point) => point[2]),
      line: {
        color: "rgba(255, 127, 80, 0.55)",
        width: 4
      },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function buildFigure(kinematics) {
    const jointLabels = ["Base", "J1", "J2", "J3", "J4", "J5", "Tool"];
    const endEffector = kinematics.origins[kinematics.origins.length - 1];
    updateTrail(endEffector);

    const orientationAxes = [
      [kinematics.transform[0][0], kinematics.transform[1][0], kinematics.transform[2][0]],
      [kinematics.transform[0][1], kinematics.transform[1][1], kinematics.transform[2][1]],
      [kinematics.transform[0][2], kinematics.transform[1][2], kinematics.transform[2][2]]
    ];

    const robotTrace = createTrace(kinematics.origins, "#2780e3", "Robot");
    const shadowTrace = createTrace(
      kinematics.origins.map((point) => [point[0], point[1], 0]),
      "rgba(31, 45, 61, 0.18)",
      "Shadow"
    );
    shadowTrace.line.dash = "dot";

    const jointTrace = {
      type: "scatter3d",
      mode: "markers+text",
      x: kinematics.origins.map((point) => point[0]),
      y: kinematics.origins.map((point) => point[1]),
      z: kinematics.origins.map((point) => point[2]),
      text: jointLabels,
      textposition: "top center",
      marker: {
        color: ["#0b1f33", "#2780e3", "#2780e3", "#2780e3", "#2780e3", "#2780e3", "#ff7f50"],
        size: [6, 6, 6, 6, 6, 6, 7],
        line: {
          color: "#ffffff",
          width: 1.5
        }
      },
      hovertemplate: "%{text}<br>x=%{x:.3f} m<br>y=%{y:.3f} m<br>z=%{z:.3f} m<extra></extra>",
      showlegend: false
    };

    const data = [
      createGroundPlaneTrace(),
      createWorkspaceRing(),
      createDropLineTrace(endEffector),
      shadowTrace,
      robotTrace,
      jointTrace,
      createAxisTrace(endEffector, orientationAxes[0], "#e63946", "Tool X"),
      createAxisTrace(endEffector, orientationAxes[1], "#2a9d8f", "Tool Y"),
      createAxisTrace(endEffector, orientationAxes[2], "#f4a261", "Tool Z")
    ];

    const trailTrace = createTrailTrace();
    if (trailTrace) {
      data.splice(1, 0, trailTrace);
    }

    return {
      data,
      layout: {
        margin: { l: 0, r: 0, t: 10, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        showlegend: false,
        scene: {
          dragmode: "orbit",
          aspectmode: "manual",
          aspectratio: { x: 1.15, y: 1.15, z: 0.95 },
          camera: {
            eye: { x: 1.6, y: 1.5, z: 1.05 }
          },
          xaxis: {
            title: "x [m]",
            range: [-0.95, 0.95],
            gridcolor: "rgba(39, 128, 227, 0.08)",
            zerolinecolor: "rgba(39, 128, 227, 0.18)",
            showbackground: false,
            backgroundcolor: "rgba(255, 255, 255, 0)"
          },
          yaxis: {
            title: "y [m]",
            range: [-0.95, 0.95],
            gridcolor: "rgba(39, 128, 227, 0.08)",
            zerolinecolor: "rgba(39, 128, 227, 0.18)",
            showbackground: false,
            backgroundcolor: "rgba(255, 255, 255, 0)"
          },
          zaxis: {
            title: "z [m]",
            range: [-0.05, 1.1],
            gridcolor: "rgba(39, 128, 227, 0.08)",
            zerolinecolor: "rgba(39, 128, 227, 0.18)",
            showbackground: false,
            backgroundcolor: "rgba(255, 255, 255, 0)"
          }
        },
        uirevision: "robot-camera"
      },
      config: {
        displayModeBar: false,
        responsive: true,
        scrollZoom: true
      }
    };
  }

  function renderReadouts(kinematics) {
    jointReadoutRoot.innerHTML = state.angles
      .map((angle, index) => {
        return [
          '<div class="robot-readout-row">',
          '<dt>' + jointDefinitions[index].label + '</dt>',
          '<dd>' + formatSigned(angle, 0) + '&deg;</dd>',
          '</div>'
        ].join("");
      })
      .join("");

    const endEffector = kinematics.origins[kinematics.origins.length - 1];
    const poseItems = [
      ["x", formatSigned(endEffector[0], 3) + " m"],
      ["y", formatSigned(endEffector[1], 3) + " m"],
      ["z", formatSigned(endEffector[2], 3) + " m"],
      ["roll", formatSigned(kinematics.pose.roll, 1) + "&deg;"],
      ["pitch", formatSigned(kinematics.pose.pitch, 1) + "&deg;"],
      ["yaw", formatSigned(kinematics.pose.yaw, 1) + "&deg;"]
    ];

    poseReadoutRoot.innerHTML = poseItems
      .map((item) => {
        return [
          '<div class="robot-readout-row">',
          '<dt>' + item[0] + '</dt>',
          '<dd>' + item[1] + '</dd>',
          '</div>'
        ].join("");
      })
      .join("");
  }

  function syncSliders() {
    sliderInputs.forEach((input, index) => {
      input.value = String(state.angles[index]);
      sliderValues[index].textContent = formatSigned(state.angles[index], 0) + "°";
    });
  }

  function renderRobot() {
    const kinematics = forwardKinematics(state.angles);
    const figure = buildFigure(kinematics);

    if (!plotRoot.dataset.initialized) {
      Plotly.newPlot(plotRoot, figure.data, figure.layout, figure.config);
      plotRoot.dataset.initialized = "true";
    } else {
      Plotly.react(plotRoot, figure.data, figure.layout, figure.config);
    }

    renderReadouts(kinematics);
    syncSliders();
  }

  function animateTo(targetAngles) {
    if (state.animationFrame !== null) {
      cancelAnimationFrame(state.animationFrame);
      state.animationFrame = null;
    }

    const startAngles = state.angles.slice();
    const startTime = performance.now();
    const duration = 550;

    function easeInOut(value) {
      return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
    }

    function stepFrame(timestamp) {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = easeInOut(progress);

      state.angles = startAngles.map((angle, index) => {
        return angle + ((targetAngles[index] - angle) * eased);
      });

      renderRobot();

      if (progress < 1) {
        state.animationFrame = requestAnimationFrame(stepFrame);
      } else {
        state.angles = targetAngles.slice();
        state.animationFrame = null;
        renderRobot();
      }
    }

    state.animationFrame = requestAnimationFrame(stepFrame);
  }

  function randomPose() {
    return jointDefinitions.map((joint) => {
      const span = joint.max - joint.min;
      return joint.min + (Math.random() * span);
    });
  }

  function buildSliders() {
    const actionRow = slidersRoot.querySelector(".robot-slider-actions");

    jointDefinitions.forEach((joint, index) => {
      const wrapper = document.createElement("label");
      wrapper.className = "robot-slider";

      const header = document.createElement("span");
      header.className = "robot-slider__header";

      const name = document.createElement("span");
      name.className = "robot-slider__name";
      name.textContent = joint.label;

      const value = document.createElement("span");
      value.className = "robot-slider__value";

      header.appendChild(name);
      header.appendChild(value);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(joint.min);
      input.max = String(joint.max);
      input.step = "1";
      input.value = String(joint.value);
      input.setAttribute("aria-label", joint.label);
      input.addEventListener("input", function () {
        state.angles[index] = Number(input.value);
        renderRobot();
      });

      wrapper.appendChild(header);
      wrapper.appendChild(input);

      if (actionRow) {
        slidersRoot.insertBefore(wrapper, actionRow);
      } else {
        slidersRoot.appendChild(wrapper);
      }

      sliderInputs.push(input);
      sliderValues.push(value);
    });
  }

  buildSliders();

  presetButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const presetName = button.dataset.preset;
      const targetAngles = presetName === "random" ? randomPose() : presets[presetName];

      if (targetAngles) {
        animateTo(targetAngles);
      }
    });
  });

  renderRobot();
})();