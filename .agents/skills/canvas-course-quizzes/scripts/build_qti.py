from __future__ import annotations

import argparse
from datetime import datetime, timezone
import html
import json
from pathlib import Path
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile


QTI_NS = "http://www.imsglobal.org/xsd/ims_qtiasiv1p2"
CC_NS = "http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1"
IMSMD_NS = "http://www.imsglobal.org/xsd/imsmd_v1p2"
CANVAS_NS = "http://canvas.instructure.com/xsd/cccv1p0"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
ID_NAMESPACE = uuid.UUID("a1ad5740-6cae-43a0-9165-1516f043e781")
COGNITIVE_LEVELS = {"remember", "understand", "apply", "analyze"}
QUESTION_TYPES = {"single_choice", "multiple_answer", "true_false"}
CANVAS_QUESTION_TYPES = {
    "single_choice": "multiple_choice_question",
    "multiple_answer": "multiple_answers_question",
    "true_false": "true_false_question",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Canvas-compatible selected-response QTI 1.2 package."
    )
    parser.add_argument("source", type=Path, help="Path to the reviewed quiz JSON")
    parser.add_argument("--output", type=Path, help="Output ZIP path")
    parser.add_argument("--build-dir", type=Path, help="Directory for generated XML")
    return parser.parse_args()


def stable_id(kind: str, value: str) -> str:
    return "i" + uuid.uuid5(ID_NAMESPACE, f"{kind}:{value}").hex


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "canvas_quiz"


def require_text(mapping: dict, key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: '{key}' must be non-empty text")
    return value


def validate_quiz(data: dict) -> None:
    for key in ("title", "description", "purpose", "quiz_type"):
        require_text(data, key, "quiz")

    assumed_prerequisites = data.get("assumed_prerequisites")
    if not isinstance(assumed_prerequisites, list) or not all(
        isinstance(value, str) and value.strip()
        for value in assumed_prerequisites
    ):
        raise ValueError(
            "quiz: 'assumed_prerequisites' must be a list of non-empty text values"
        )

    for key in ("shuffle_answers", "show_correct_answers"):
        if not isinstance(data.get(key), bool):
            raise ValueError(f"quiz: '{key}' must be true or false")

    allowed_attempts = data.get("allowed_attempts")
    if not isinstance(allowed_attempts, int) or allowed_attempts < 1:
        raise ValueError("quiz: 'allowed_attempts' must be a positive integer")

    source_pages = data.get("source_pages")
    if not isinstance(source_pages, list) or not source_pages or not all(
        isinstance(value, str) and value.strip() for value in source_pages
    ):
        raise ValueError("quiz: 'source_pages' must contain at least one path")

    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError("quiz: 'questions' must be a non-empty list")

    seen_titles: set[str] = set()
    seen_prompts: set[str] = set()
    for index, question in enumerate(questions, start=1):
        context = f"question {index}"
        title = require_text(question, "title", context)
        prompt = require_text(question, "prompt", context)
        question_type = require_text(question, "question_type", context)
        require_text(question, "learning_objective", context)
        require_text(question, "relevance", context)
        require_text(question, "correct_feedback", context)
        require_text(question, "incorrect_feedback", context)

        if title.casefold() in seen_titles:
            raise ValueError(f"{context}: duplicate question title '{title}'")
        if prompt.casefold() in seen_prompts:
            raise ValueError(f"{context}: duplicate prompt")
        seen_titles.add(title.casefold())
        seen_prompts.add(prompt.casefold())

        if question_type not in QUESTION_TYPES:
            raise ValueError(
                f"{context}: 'question_type' must be one of "
                f"{', '.join(sorted(QUESTION_TYPES))}"
            )

        if question.get("cognitive_level") not in COGNITIVE_LEVELS:
            raise ValueError(
                f"{context}: 'cognitive_level' must be one of "
                f"{', '.join(sorted(COGNITIVE_LEVELS))}"
            )

        source_sections = question.get("source_sections")
        if not isinstance(source_sections, list) or not source_sections or not all(
            isinstance(value, str) and value.strip() for value in source_sections
        ):
            raise ValueError(f"{context}: 'source_sections' must be a non-empty list")

        connections = question.get("connections")
        if not isinstance(connections, list) or not all(
            isinstance(value, str) and value.strip() for value in connections
        ):
            raise ValueError(f"{context}: 'connections' must be a list of text values")

        choices = question.get("choices")
        if not isinstance(choices, list):
            raise ValueError(f"{context}: 'choices' must be a list")
        if question_type == "true_false":
            if choices != ["True", "False"]:
                raise ValueError(
                    f"{context}: true/false choices must be ['True', 'False']"
                )
        elif not 3 <= len(choices) <= 5:
            raise ValueError(f"{context}: provide between three and five choices")
        if not all(isinstance(choice, str) and choice.strip() for choice in choices):
            raise ValueError(f"{context}: every choice must be non-empty text")
        if len({choice.casefold() for choice in choices}) != len(choices):
            raise ValueError(f"{context}: choices must be unique")

        correct = question.get("correct")
        if question_type == "multiple_answer":
            if (
                not isinstance(correct, list)
                or len(correct) < 2
                or len(correct) >= len(choices)
                or len(set(correct)) != len(correct)
                or not all(
                    isinstance(value, int) and 0 <= value < len(choices)
                    for value in correct
                )
            ):
                raise ValueError(
                    f"{context}: multiple-answer 'correct' must contain at least "
                    "two unique indices, with at least one incorrect choice"
                )
            correct_indices = set(correct)
        else:
            if not isinstance(correct, int) or not 0 <= correct < len(choices):
                raise ValueError(f"{context}: 'correct' is not a valid choice index")
            correct_indices = {correct}

        rationales = question.get("distractor_rationales")
        if not isinstance(rationales, list) or len(rationales) != len(choices):
            raise ValueError(
                f"{context}: 'distractor_rationales' must match the choices"
            )
        for choice_index, rationale in enumerate(rationales):
            if not isinstance(rationale, str):
                raise ValueError(f"{context}: every distractor rationale must be text")
            if choice_index in correct_indices and rationale.strip():
                raise ValueError(
                    f"{context}: correct choices must have an empty rationale"
                )
            if choice_index not in correct_indices and not rationale.strip():
                raise ValueError(
                    f"{context}: every wrong choice needs a misconception rationale"
                )

        points = question.get("points")
        if not isinstance(points, (int, float)) or points <= 0:
            raise ValueError(f"{context}: 'points' must be greater than zero")


def element(
    parent: ET.Element, tag: str, text: str | None = None, **attrs: str
) -> ET.Element:
    child = ET.SubElement(parent, tag, attrs)
    child.text = text
    return child


def metadata_field(parent: ET.Element, label: str, value: str) -> None:
    field = element(parent, "qtimetadatafield")
    element(field, "fieldlabel", label)
    element(field, "fieldentry", value)


def html_text(value: str) -> str:
    return f"<p>{html.escape(value)}</p>"


def add_feedback(item: ET.Element, ident: str, text: str) -> None:
    feedback = element(item, "itemfeedback", ident=ident)
    flow = element(feedback, "flow_mat")
    material = element(flow, "material")
    element(material, "mattext", html_text(text), texttype="text/html")


def build_assessment(data: dict, assessment_id: str) -> ET.Element:
    root = ET.Element(
        "questestinterop",
        {
            "xmlns": QTI_NS,
            "xmlns:xsi": XSI_NS,
            "xsi:schemaLocation": (
                f"{QTI_NS} http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd"
            ),
        },
    )
    assessment = element(root, "assessment", ident=assessment_id, title=data["title"])
    assessment_metadata = element(assessment, "qtimetadata")
    metadata_field(assessment_metadata, "cc_maxattempts", str(data["allowed_attempts"]))
    section = element(assessment, "section", ident="root_section")

    for index, question in enumerate(data["questions"], start=1):
        question_type = question["question_type"]
        question_id = stable_id("question", question["title"])
        question_ref = stable_id("question_ref", question["title"])
        choice_ids = [
            stable_id("choice", f"{question['title']}:{choice}")
            for choice in question["choices"]
        ]

        item = element(section, "item", ident=question_id, title=f"Question {index}")
        item_metadata = element(item, "itemmetadata")
        qti_metadata = element(item_metadata, "qtimetadata")
        metadata_field(
            qti_metadata, "question_type", CANVAS_QUESTION_TYPES[question_type]
        )
        metadata_field(qti_metadata, "points_possible", str(question["points"]))
        metadata_field(qti_metadata, "original_answer_ids", ",".join(choice_ids))
        metadata_field(qti_metadata, "assessment_question_identifierref", question_ref)

        presentation = element(item, "presentation")
        material = element(presentation, "material")
        element(material, "mattext", html_text(question["prompt"]), texttype="text/html")
        cardinality = "Multiple" if question_type == "multiple_answer" else "Single"
        response = element(
            presentation, "response_lid", ident="response1", rcardinality=cardinality
        )
        shuffle = "No" if question_type == "true_false" else "Yes"
        choices = element(response, "render_choice", shuffle=shuffle)
        for choice_id, choice_text in zip(choice_ids, question["choices"]):
            label = element(choices, "response_label", ident=choice_id)
            choice_material = element(label, "material")
            element(
                choice_material,
                "mattext",
                html_text(choice_text),
                texttype="text/html",
            )

        processing = element(item, "resprocessing")
        outcomes = element(processing, "outcomes")
        element(
            outcomes,
            "decvar",
            maxvalue="100",
            minvalue="0",
            varname="SCORE",
            vartype="Decimal",
        )

        if question_type == "multiple_answer":
            correct_indices = set(question["correct"])
        else:
            correct_indices = {question["correct"]}
        correct_condition = element(processing, "respcondition")
        correct_condition.attrib["continue"] = "No"
        condition = element(correct_condition, "conditionvar")
        if question_type == "multiple_answer":
            conjunction = element(condition, "and")
            for choice_index, choice_id in enumerate(choice_ids):
                if choice_index in correct_indices:
                    element(conjunction, "varequal", choice_id, respident="response1")
                else:
                    negation = element(conjunction, "not")
                    element(negation, "varequal", choice_id, respident="response1")
        else:
            correct_id = choice_ids[next(iter(correct_indices))]
            element(condition, "varequal", correct_id, respident="response1")
        element(correct_condition, "setvar", "100", action="Set", varname="SCORE")
        element(
            correct_condition,
            "displayfeedback",
            feedbacktype="Response",
            linkrefid="correct_fb",
        )

        incorrect_condition = element(processing, "respcondition")
        incorrect_condition.attrib["continue"] = "No"
        incorrect_var = element(incorrect_condition, "conditionvar")
        element(incorrect_var, "other")
        element(
            incorrect_condition,
            "displayfeedback",
            feedbacktype="Response",
            linkrefid="general_incorrect_fb",
        )

        add_feedback(item, "correct_fb", question["correct_feedback"])
        add_feedback(item, "general_incorrect_fb", question["incorrect_feedback"])

    return root


def build_manifest(
    assessment_id: str, dependency_id: str, date: str, quiz_title: str
) -> ET.Element:
    root = ET.Element(
        "manifest",
        {
            "identifier": stable_id("manifest", assessment_id),
            "xmlns": CC_NS,
            "xmlns:imsmd": IMSMD_NS,
            "xmlns:xsi": XSI_NS,
            "xsi:schemaLocation": (
                f"{CC_NS} http://www.imsglobal.org/xsd/imscp_v1p1.xsd "
                f"{IMSMD_NS} http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd"
            ),
        },
    )
    metadata = element(root, "metadata")
    element(metadata, "schema", "IMS Content")
    element(metadata, "schemaversion", "1.1.3")
    lom = element(metadata, "imsmd:lom")
    general = element(lom, "imsmd:general")
    title = element(general, "imsmd:title")
    element(title, "imsmd:string", quiz_title)
    lifecycle = element(lom, "imsmd:lifeCycle")
    contribution = element(lifecycle, "imsmd:contribute")
    date_element = element(contribution, "imsmd:date")
    element(date_element, "imsmd:dateTime", date)
    element(root, "organizations")
    resources = element(root, "resources")

    assessment_resource = element(
        resources,
        "resource",
        identifier=assessment_id,
        type="imsqti_xmlv1p2",
    )
    element(assessment_resource, "file", href=f"{assessment_id}/{assessment_id}.xml")
    element(assessment_resource, "dependency", identifierref=dependency_id)

    metadata_resource = element(
        resources,
        "resource",
        identifier=dependency_id,
        type="associatedcontent/imscc_xmlv1p1/learning-application-resource",
        href=f"{assessment_id}/assessment_meta.xml",
    )
    element(metadata_resource, "file", href=f"{assessment_id}/assessment_meta.xml")
    return root


def build_assessment_meta(data: dict, assessment_id: str) -> ET.Element:
    assignment_id = stable_id("assignment", assessment_id)
    group_id = stable_id("assignment_group", assessment_id)
    points = sum(question["points"] for question in data["questions"])
    root = ET.Element(
        "quiz",
        {
            "identifier": assessment_id,
            "xmlns": CANVAS_NS,
            "xmlns:xsi": XSI_NS,
            "xsi:schemaLocation": (
                f"{CANVAS_NS} https://canvas.instructure.com/xsd/cccv1p0.xsd"
            ),
        },
    )
    element(root, "title", data["title"])
    element(root, "description", html_text(data["description"]))
    element(root, "shuffle_answers", str(data["shuffle_answers"]).lower())
    element(root, "scoring_policy", "keep_highest")
    element(root, "hide_results")
    element(root, "quiz_type", data["quiz_type"])
    element(root, "points_possible", f"{points:.1f}")
    element(root, "require_lockdown_browser", "false")
    element(root, "require_lockdown_browser_for_results", "false")
    element(root, "show_correct_answers", str(data["show_correct_answers"]).lower())
    element(root, "allowed_attempts", str(data["allowed_attempts"]))
    element(root, "one_question_at_a_time", "false")
    element(root, "cant_go_back", "false")
    element(root, "available", "false")
    element(root, "one_time_results", "false")
    element(root, "module_locked", "false")

    assignment = element(root, "assignment", identifier=assignment_id)
    element(assignment, "title", data["title"])
    element(assignment, "due_at")
    element(assignment, "lock_at")
    element(assignment, "unlock_at")
    element(assignment, "module_locked", "false")
    element(assignment, "workflow_state", "unpublished")
    element(assignment, "quiz_identifierref", assessment_id)
    element(assignment, "has_group_category", "false")
    element(assignment, "points_possible", f"{points:.1f}")
    element(assignment, "grading_type", "points")
    element(assignment, "submission_types", "online_quiz")
    element(assignment, "position", "1")
    element(root, "assignment_group_identifierref", group_id)
    return root


def write_xml(path: Path, root: ET.Element) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    data = json.loads(source.read_text(encoding="utf-8"))
    validate_quiz(data)

    output = (args.output or source.with_name(f"{slugify(data['title'])}_qti12.zip")).resolve()
    build_dir = (args.build_dir or source.parent / "build").resolve()
    assessment_id = stable_id("assessment", data["title"])
    dependency_id = stable_id("dependency", data["title"])
    assessment_dir = build_dir / assessment_id

    manifest_path = build_dir / "imsmanifest.xml"
    assessment_path = assessment_dir / f"{assessment_id}.xml"
    metadata_path = assessment_dir / "assessment_meta.xml"

    write_xml(
        manifest_path,
        build_manifest(
            assessment_id,
            dependency_id,
            datetime.now(timezone.utc).date().isoformat(),
            data["title"],
        ),
    )
    write_xml(assessment_path, build_assessment(data, assessment_id))
    write_xml(metadata_path, build_assessment_meta(data, assessment_id))

    for path in (manifest_path, assessment_path, metadata_path):
        ET.parse(path)

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(manifest_path, "imsmanifest.xml")
        archive.writestr("non_cc_assessments/", "")
        archive.write(assessment_path, f"{assessment_id}/{assessment_id}.xml")
        archive.write(metadata_path, f"{assessment_id}/assessment_meta.xml")

    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("The generated ZIP failed its integrity check")
        required = {
            "imsmanifest.xml",
            f"{assessment_id}/{assessment_id}.xml",
            f"{assessment_id}/assessment_meta.xml",
        }
        if not required.issubset(set(archive.namelist())):
            raise RuntimeError("The generated ZIP is missing required QTI files")

    points = sum(question["points"] for question in data["questions"])
    print(
        f"Created {output} with {len(data['questions'])} questions "
        f"({points:g} points)."
    )


if __name__ == "__main__":
    main()
