/**
 * @license
 * Copyright 2011 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Object representing a trash can icon.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.module('Blockly.Trashcan');
goog.module.declareLegacyNamespace();

goog.require('Blockly.browserEvents');
goog.require('Blockly.ComponentManager');
goog.require('Blockly.DeleteArea');
goog.require('Blockly.Events');
/** @suppress {extraRequire} */
goog.require('Blockly.Events.TrashcanOpen');
goog.require('Blockly.IAutoHideable');
goog.require('Blockly.internalConstants');
goog.require('Blockly.IPositionable');
goog.require('Blockly.Options');
goog.require('Blockly.registry');
goog.require('Blockly.uiPosition');
goog.require('Blockly.utils');
goog.require('Blockly.utils.dom');
goog.require('Blockly.utils.Rect');
goog.require('Blockly.utils.Svg');
goog.require('Blockly.utils.toolbox');
goog.require('Blockly.Xml');

goog.requireType('Blockly.Events.Abstract');
goog.requireType('Blockly.IDraggable');
goog.requireType('Blockly.IFlyout');
goog.requireType('Blockly.utils.Rect');
goog.requireType('Blockly.WorkspaceSvg');


/**
 * Class for a trash can.
 * @param {!Blockly.WorkspaceSvg} workspace The workspace to sit in.
 * @constructor
 * @implements {Blockly.IAutoHideable}
 * @implements {Blockly.IPositionable}
 * @extends {Blockly.DeleteArea}
 */
const Trashcan = function(workspace) {
  Trashcan.superClass_.constructor.call(this);
  /**
   * The workspace the trashcan sits in.
   * @type {!Blockly.WorkspaceSvg}
   * @private
   */
  this.workspace_ = workspace;

  /**
   * The unique id for this component that is used to register with the
   * ComponentManager.
   * @type {string}
   */
  this.id = 'trashcan';

  /**
   * A list of XML (stored as strings) representing blocks in the trashcan.
   * @type {!Array<string>}
   * @private
   */
  this.contents_ = [];

  /**
   * The trashcan flyout.
   * @type {Blockly.IFlyout}
   * @package
   */
  this.flyout = null;

  if (this.workspace_.options.maxTrashcanContents <= 0) {
    return;
  }
  // Create flyout options.
  const flyoutWorkspaceOptions = new Blockly.Options(
      /** @type {!Blockly.BlocklyOptions} */
      ({
        'scrollbars': true,
        'parentWorkspace': this.workspace_,
        'rtl': this.workspace_.RTL,
        'oneBasedIndex': this.workspace_.options.oneBasedIndex,
        'renderer': this.workspace_.options.renderer,
        'rendererOverrides': this.workspace_.options.rendererOverrides,
        'move': {
          'scrollbars': true,
        }
      }));
  // Create vertical or horizontal flyout.
  if (this.workspace_.horizontalLayout) {
    flyoutWorkspaceOptions.toolboxPosition =
        this.workspace_.toolboxPosition == Blockly.utils.toolbox.Position.TOP ?
        Blockly.utils.toolbox.Position.BOTTOM : Blockly.utils.toolbox.Position.TOP;
    const HorizontalFlyout = Blockly.registry.getClassFromOptions(
        Blockly.registry.Type.FLYOUTS_HORIZONTAL_TOOLBOX,
        this.workspace_.options, true);
    this.flyout = new HorizontalFlyout(flyoutWorkspaceOptions);
  } else {
    flyoutWorkspaceOptions.toolboxPosition =
      this.workspace_.toolboxPosition == Blockly.utils.toolbox.Position.RIGHT ?
        Blockly.utils.toolbox.Position.LEFT : Blockly.utils.toolbox.Position.RIGHT;
    const VerticalFlyout = Blockly.registry.getClassFromOptions(
        Blockly.registry.Type.FLYOUTS_VERTICAL_TOOLBOX,
        this.workspace_.options, true);
    this.flyout = new VerticalFlyout(flyoutWorkspaceOptions);
  }
  this.workspace_.addChangeListener(this.onDelete_.bind(this));
};
Blockly.utils.object.inherits(Trashcan, Blockly.DeleteArea);

/**
 * Width of both the trash can and lid images.
 */
const WIDTH = 47;

/**
 * Height of the trashcan image (minus lid).
 */
const BODY_HEIGHT = 44;

/**
 * Height of the lid image.
 */
const LID_HEIGHT = 16;

/**
 * Distance between trashcan and bottom or top edge of workspace.
 */
const MARGIN_VERTICAL = 20;

/**
 * Distance between trashcan and right or left edge of workspace.
 */
const MARGIN_HORIZONTAL = 20;

/**
 * Extent of hotspot on all sides beyond the size of the image.
 */
const MARGIN_HOTSPOT = 10;

/**
 * Location of trashcan in sprite image.
 */
const SPRITE_LEFT = 0;

/**
 * Location of trashcan in sprite image.
 */
const SPRITE_TOP = 32;

/**
 * The openness of the lid when the trashcan contains blocks.
 *    (0.0 = closed, 1.0 = open)
 */
const HAS_BLOCKS_LID_ANGLE = 0.1;

/**
 * The length of the lid open/close animation in milliseconds.
 */
const ANIMATION_LENGTH = 80;

/**
 * The number of frames in the animation.
 */
const ANIMATION_FRAMES = 4;

/**
 * The minimum (resting) opacity of the trashcan and lid.
 */
const OPACITY_MIN = 0.4;

/**
 * The maximum (hovered) opacity of the trashcan and lid.
 */
const OPACITY_MAX = 0.8;

/**
 * The maximum angle the trashcan lid can opens to. At the end of the open
 * animation the lid will be open to this angle.
 */
const MAX_LID_ANGLE = 45;

/**
 * Current open/close state of the lid.
 * @type {boolean}
 */
Trashcan.prototype.isLidOpen = false;

/**
 * The minimum openness of the lid. Used to indicate if the trashcan contains
 *  blocks.
 * @type {number}
 * @private
 */
Trashcan.prototype.minOpenness_ = 0;

/**
 * The SVG group containing the trash can.
 * @type {SVGElement}
 * @private
 */
Trashcan.prototype.svgGroup_ = null;

/**
 * The SVG image element of the trash can lid.
 * @type {SVGElement}
 * @private
 */
Trashcan.prototype.svgLid_ = null;

/**
 * Task ID of opening/closing animation.
 * @type {number}
 * @private
 */
Trashcan.prototype.lidTask_ = 0;

/**
 * Current state of lid opening (0.0 = closed, 1.0 = open).
 * @type {number}
 * @private
 */
Trashcan.prototype.lidOpen_ = 0;

/**
 * Left coordinate of the trash can.
 * @type {number}
 * @private
 */
Trashcan.prototype.left_ = 0;

/**
 * Top coordinate of the trash can.
 * @type {number}
 * @private
 */
Trashcan.prototype.top_ = 0;

/**
 * Whether this has been initialized.
 * @type {boolean}
 * @private
 */
Trashcan.prototype.initialized_ = false;

/**
 * Create the trash can elements.
 * @return {!SVGElement} The trash can's SVG group.
 */
Trashcan.prototype.createDom = function() {
  /* Here's the markup that will be generated:
  <g class="blocklyTrash">
    <clippath id="blocklyTrashBodyClipPath837493">
      <rect width="47" height="45" y="15"></rect>
    </clippath>
    <image width="64" height="92" y="-32" xlink:href="media/sprites.png"
        clip-path="url(#blocklyTrashBodyClipPath837493)"></image>
    <clippath id="blocklyTrashLidClipPath837493">
      <rect width="47" height="15"></rect>
    </clippath>
    <image width="84" height="92" y="-32" xlink:href="media/sprites.png"
        clip-path="url(#blocklyTrashLidClipPath837493)"></image>
  </g>
  */
  this.svgGroup_ = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {'class': 'blocklyTrash'}, null);
  let clip;
  const rnd = String(Math.random()).substring(2);
  clip = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.CLIPPATH,
      {'id': 'blocklyTrashBodyClipPath' + rnd},
      this.svgGroup_);
  Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT,
      {
        'width': WIDTH,
        'height': BODY_HEIGHT,
        'y': LID_HEIGHT
      },
      clip);
  const body = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE, {
        'width': Blockly.internalConstants.SPRITE.width,
        'x': -SPRITE_LEFT,
        'height': Blockly.internalConstants.SPRITE.height,
        'y': -SPRITE_TOP,
        'clip-path': 'url(#blocklyTrashBodyClipPath' + rnd + ')'
      },
      this.svgGroup_);
  body.setAttributeNS(
      Blockly.utils.dom.XLINK_NS, 'xlink:href',
      this.workspace_.options.pathToMedia +
          Blockly.internalConstants.SPRITE.url);

  clip = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.CLIPPATH,
      {'id': 'blocklyTrashLidClipPath' + rnd},
      this.svgGroup_);
  Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT,
      {'width': WIDTH, 'height': LID_HEIGHT}, clip);
  this.svgLid_ = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE, {
        'width': Blockly.internalConstants.SPRITE.width,
        'x': -SPRITE_LEFT,
        'height': Blockly.internalConstants.SPRITE.height,
        'y': -SPRITE_TOP,
        'clip-path': 'url(#blocklyTrashLidClipPath' + rnd + ')'
      },
      this.svgGroup_);
  this.svgLid_.setAttributeNS(
      Blockly.utils.dom.XLINK_NS, 'xlink:href',
      this.workspace_.options.pathToMedia +
          Blockly.internalConstants.SPRITE.url);

  // bindEventWithChecks_ quashes events too aggressively. See:
  // https://groups.google.com/forum/#!topic/blockly/QF4yB9Wx00s
  // Using bindEventWithChecks_ for blocking mousedown causes issue in mobile.
  // See #4303
  Blockly.browserEvents.bind(
      this.svgGroup_, 'mousedown', this, this.blockMouseDownWhenOpenable_);
  Blockly.browserEvents.bind(this.svgGroup_, 'mouseup', this, this.click);
  // Bind to body instead of this.svgGroup_ so that we don't get lid jitters
  Blockly.browserEvents.bind(body, 'mouseover', this, this.mouseOver_);
  Blockly.browserEvents.bind(body, 'mouseout', this, this.mouseOut_);
  this.animateLid_();
  return this.svgGroup_;
};

/**
 * Initializes the trash can.
 */
Trashcan.prototype.init = function() {
  if (this.workspace_.options.maxTrashcanContents > 0) {
    Blockly.utils.dom.insertAfter(
        this.flyout.createDom(Blockly.utils.Svg.SVG),
        this.workspace_.getParentSvg());
    this.flyout.init(this.workspace_);
  }
  this.workspace_.getComponentManager().addComponent({
    component: this,
    weight: 1,
    capabilities: [
      Blockly.ComponentManager.Capability.AUTOHIDEABLE,
      Blockly.ComponentManager.Capability.DELETE_AREA,
      Blockly.ComponentManager.Capability.DRAG_TARGET,
      Blockly.ComponentManager.Capability.POSITIONABLE
    ]
  });
  this.initialized_ = true;
  this.setLidOpen(false);
};

/**
 * Dispose of this trash can.
 * Unlink from all DOM elements to prevent memory leaks.
 * @suppress {checkTypes}
 */
Trashcan.prototype.dispose = function() {
  this.workspace_.getComponentManager().removeComponent('trashcan');
  if (this.svgGroup_) {
    Blockly.utils.dom.removeNode(this.svgGroup_);
    this.svgGroup_ = null;
  }
  this.svgLid_ = null;
  this.workspace_ = null;
  clearTimeout(this.lidTask_);
};

/**
 * Whether the trashcan has contents.
 * @return {boolean} True if the trashcan has contents.
 * @private
 */
Trashcan.prototype.hasContents_ = function() {
  return !!this.contents_.length;
};

/**
 * Returns true if the trashcan contents-flyout is currently open.
 * @return {boolean} True if the trashcan contents-flyout is currently open.
 */
Trashcan.prototype.contentsIsOpen = function() {
  return this.flyout.isVisible();
};

/**
 * Opens the trashcan flyout.
 */
Trashcan.prototype.openFlyout = function() {
  if (this.contentsIsOpen()) {
    return;
  }
  const xml = this.contents_.map(Blockly.Xml.textToDom);
  this.flyout.show(xml);
  this.fireUiEvent_(true);
};

/**
 * Closes the trashcan flyout.
 */
Trashcan.prototype.closeFlyout = function() {
  if (!this.contentsIsOpen()) {
    return;
  }
  this.flyout.hide();
  this.fireUiEvent_(false);
};

/**
 * Hides the component. Called in Blockly.hideChaff.
 * @param {boolean} onlyClosePopups Whether only popups should be closed.
 *     Flyouts should not be closed if this is true.
 */
Trashcan.prototype.autoHide = function(onlyClosePopups) {
  // For now the trashcan flyout always autocloses because it overlays the
  // trashcan UI (no trashcan to click to close it).
  if (!onlyClosePopups && this.flyout) {
    this.closeFlyout();
  }
};

/**
 * Empties the trashcan's contents. If the contents-flyout is currently open
 * it will be closed.
 */
Trashcan.prototype.emptyContents = function() {
  if (!this.hasContents_()) {
    return;
  }
  this.contents_.length = 0;
  this.setMinOpenness_(0);
  this.closeFlyout();
};

/**
 * Positions the trashcan.
 * It is positioned in the opposite corner to the corner the
 * categories/toolbox starts at.
 * @param {!Blockly.MetricsManager.UiMetrics} metrics The workspace metrics.
 * @param {!Array<!Blockly.utils.Rect>} savedPositions List of rectangles that
 *     are already on the workspace.
 */
Trashcan.prototype.position = function(metrics, savedPositions) {
  // Not yet initialized.
  if (!this.initialized_) {
    return;
  }

  const cornerPosition =
      Blockly.uiPosition.getCornerOppositeToolbox(this.workspace_, metrics);

  const height = BODY_HEIGHT + LID_HEIGHT;
  const startRect = Blockly.uiPosition.getStartPositionRect(
      cornerPosition, new Blockly.utils.Size(WIDTH, height),
      MARGIN_HORIZONTAL, MARGIN_VERTICAL, metrics, this.workspace_);

  const verticalPosition = cornerPosition.vertical;
  const bumpDirection =
      verticalPosition === Blockly.uiPosition.verticalPosition.TOP ?
          Blockly.uiPosition.bumpDirection.DOWN :
          Blockly.uiPosition.bumpDirection.UP;
  const positionRect = Blockly.uiPosition.bumpPositionRect(
      startRect, MARGIN_VERTICAL, bumpDirection, savedPositions);

  this.top_ = positionRect.top;
  this.left_ = positionRect.left;
  this.svgGroup_.setAttribute('transform',
      'translate(' + this.left_ + ',' + this.top_ + ')');
};

/**
 * Returns the bounding rectangle of the UI element in pixel units relative to
 * the Blockly injection div.
 * @return {?Blockly.utils.Rect} The UI elements’s bounding box. Null if
 *   bounding box should be ignored by other UI elements.
 */
Trashcan.prototype.getBoundingRectangle = function() {
  const bottom = this.top_ + BODY_HEIGHT + LID_HEIGHT;
  const right = this.left_ + WIDTH;
  return new Blockly.utils.Rect(this.top_, bottom, this.left_, right);
};

/**
 * Returns the bounding rectangle of the drag target area in pixel units
 * relative to viewport.
 * @return {?Blockly.utils.Rect} The component's bounding box. Null if drag
 *   target area should be ignored.
 */
Trashcan.prototype.getClientRect = function() {
  if (!this.svgGroup_) {
    return null;
  }

  const trashRect = this.svgGroup_.getBoundingClientRect();
  const top = trashRect.top + SPRITE_TOP - MARGIN_HOTSPOT;
  const bottom = top + LID_HEIGHT + BODY_HEIGHT +
      2 * MARGIN_HOTSPOT;
  const left = trashRect.left + SPRITE_LEFT - MARGIN_HOTSPOT;
  const right = left + WIDTH + 2 * MARGIN_HOTSPOT;
  return new Blockly.utils.Rect(top, bottom, left, right);
};

/**
 * Handles when a cursor with a block or bubble is dragged over this drag
 * target.
 * @param {!Blockly.IDraggable} _dragElement The block or bubble currently being
 *   dragged.
 * @override
 */
Trashcan.prototype.onDragOver = function(_dragElement) {
  this.setLidOpen(this.wouldDelete_);
};

/**
 * Handles when a cursor with a block or bubble exits this drag target.
 * @param {!Blockly.IDraggable} _dragElement The block or bubble currently being
 *   dragged.
 * @override
 */
Trashcan.prototype.onDragExit = function(_dragElement) {
  this.setLidOpen(false);
};

/**
 * Handles when a block or bubble is dropped on this component.
 * Should not handle delete here.
 * @param {!Blockly.IDraggable} _dragElement The block or bubble currently being
 *   dragged.
 * @override
 */
Trashcan.prototype.onDrop = function(_dragElement) {
  setTimeout(this.setLidOpen.bind(this, false), 100);
};

/**
 * Flip the lid open or shut.
 * @param {boolean} state True if open.
 * @package
 */
Trashcan.prototype.setLidOpen = function(state) {
  if (this.isLidOpen == state) {
    return;
  }
  clearTimeout(this.lidTask_);
  this.isLidOpen = state;
  this.animateLid_();
};

/**
 * Rotate the lid open or closed by one step.  Then wait and recurse.
 * @private
 */
Trashcan.prototype.animateLid_ = function() {
  const frames = ANIMATION_FRAMES;

  const delta = 1 / (frames + 1);
  this.lidOpen_ += this.isLidOpen ? delta : -delta;
  this.lidOpen_ = Math.min(Math.max(this.lidOpen_, this.minOpenness_), 1);

  this.setLidAngle_(this.lidOpen_ * MAX_LID_ANGLE);

  // Linear interpolation between min and max.
  const opacity = OPACITY_MIN + this.lidOpen_ * (OPACITY_MAX - OPACITY_MIN);
  this.svgGroup_.style.opacity = opacity;

  if (this.lidOpen_ > this.minOpenness_ && this.lidOpen_ < 1) {
    this.lidTask_ = setTimeout(this.animateLid_.bind(this),
        ANIMATION_LENGTH / frames);
  }
};

/**
 * Set the angle of the trashcan's lid.
 * @param {number} lidAngle The angle at which to set the lid.
 * @private
 */
Trashcan.prototype.setLidAngle_ = function(lidAngle) {
  const openAtRight =
      this.workspace_.toolboxPosition == Blockly.utils.toolbox.Position.RIGHT ||
      (this.workspace_.horizontalLayout && this.workspace_.RTL);
  this.svgLid_.setAttribute('transform', 'rotate(' +
      (openAtRight ? -lidAngle : lidAngle) + ',' +
      (openAtRight ? 4 : WIDTH - 4) + ',' +
      (LID_HEIGHT - 2) + ')');
};

/**
 * Sets the minimum openness of the trashcan lid. If the lid is currently
 * closed, this will update lid's position.
 * @param {number} newMin The new minimum openness of the lid. Should be between
 *     0 and 1.
 * @private
 */
Trashcan.prototype.setMinOpenness_ = function(newMin) {
  this.minOpenness_ = newMin;
  if (!this.isLidOpen) {
    this.setLidAngle_(newMin * MAX_LID_ANGLE);
  }
};

/**
 * Flip the lid shut.
 * Called externally after a drag.
 */
Trashcan.prototype.closeLid = function() {
  this.setLidOpen(false);
};

/**
 * Inspect the contents of the trash.
 */
Trashcan.prototype.click = function() {
  if (!this.hasContents_()) {
    return;
  }
  this.openFlyout();
};

/**
 * Fires a UI event for trashcan flyout open or close.
 * @param {boolean} trashcanOpen Whether the flyout is opening.
 * @private
 */
Trashcan.prototype.fireUiEvent_ = function(trashcanOpen) {
  const uiEvent = new (Blockly.Events.get(Blockly.Events.TRASHCAN_OPEN))(
      trashcanOpen,this.workspace_.id);
  Blockly.Events.fire(uiEvent);
};

/**
 * Prevents a workspace scroll and click event if the trashcan has blocks.
 * @param {!Event} e A mouse down event.
 * @private
 */
Trashcan.prototype.blockMouseDownWhenOpenable_ = function(e) {
  if (!this.contentsIsOpen() && this.hasContents_()) {
    e.stopPropagation();  // Don't start a workspace scroll.
  }
};

/**
 * Indicate that the trashcan can be clicked (by opening it) if it has blocks.
 * @private
 */
Trashcan.prototype.mouseOver_ = function() {
  if (this.hasContents_()) {
    this.setLidOpen(true);
  }
};

/**
 * Close the lid of the trashcan if it was open (Vis. it was indicating it had
 *    blocks).
 * @private
 */
Trashcan.prototype.mouseOut_ = function() {
  // No need to do a .hasBlocks check here because if it doesn't the trashcan
  // won't be open in the first place, and setOpen won't run.
  this.setLidOpen(false);
};

/**
 * Handle a BLOCK_DELETE event. Adds deleted blocks oldXml to the content array.
 * @param {!Blockly.Events.Abstract} event Workspace event.
 * @private
 */
Trashcan.prototype.onDelete_ = function(event) {
  if (this.workspace_.options.maxTrashcanContents <= 0) {
    return;
  }
  // Must check that the tagName exists since oldXml can be a DocumentFragment.
  if (event.type == Blockly.Events.BLOCK_DELETE && event.oldXml.tagName &&
      event.oldXml.tagName.toLowerCase() != 'shadow') {
    const cleanedXML = this.cleanBlockXML_(event.oldXml);
    if (this.contents_.indexOf(cleanedXML) != -1) {
      return;
    }
    this.contents_.unshift(cleanedXML);
    while (this.contents_.length >
        this.workspace_.options.maxTrashcanContents) {
      this.contents_.pop();
    }

    this.setMinOpenness_(HAS_BLOCKS_LID_ANGLE);
  }
};

/**
 * Converts XML representing a block into text that can be stored in the
 *    content array.
 * @param {!Element} xml An XML tree defining the block and any
 *    connected child blocks.
 * @return {string} Text representing the XML tree, cleaned of all unnecessary
 * attributes.
 * @private
 */
Trashcan.prototype.cleanBlockXML_ = function(xml) {
  const xmlBlock = xml.cloneNode(true);
  let node = xmlBlock;
  while (node) {
    // Things like text inside tags are still treated as nodes, but they
    // don't have attributes (or the removeAttribute function) so we can
    // skip removing attributes from them.
    if (node.removeAttribute) {
      node.removeAttribute('x');
      node.removeAttribute('y');
      node.removeAttribute('id');
      node.removeAttribute('disabled');
      if (node.nodeName == 'comment') {  // Future proof just in case.
        node.removeAttribute('h');
        node.removeAttribute('w');
        node.removeAttribute('pinned');
      }
    }

    // Try to go down the tree
    let nextNode = node.firstChild || node.nextSibling;
    // If we can't go down, try to go back up the tree.
    if (!nextNode) {
      nextNode = node.parentNode;
      while (nextNode) {
        // We are valid again!
        if (nextNode.nextSibling) {
          nextNode = nextNode.nextSibling;
          break;
        }
        // Try going up again. If parentNode is null that means we have
        // reached the top, and we will break out of both loops.
        nextNode = nextNode.parentNode;
      }
    }
    node = nextNode;
  }
  return Blockly.Xml.domToText(xmlBlock);
};

exports = Trashcan;
