import React from 'react';
import {
	View,
	StyleSheet,
	Easing,
	UIManager,
	InteractionManager,
	Animated,
	Platform,
	findNodeHandle,
	Dimensions
} from 'react-native';
import PropTypes from 'prop-types';

import TransitionItems from './TransitionItems';
import TransitionOverlayView from './TransitionOverlayView';

export default class TransitionItemsView extends React.Component {
	constructor(props) {
		super(props);

		this._sharedProgress = new Animated.Value(0);
		this._transitionProgress = new Animated.Value(0);
		this._hiddenProgress = new Animated.Value(0);
		this._transitionItems = new TransitionItems();

		this.state = { currentTransition: null };
		this._isMounted = false;
		this._overlay = null;
		this._fadeTransitionTime = 25;		

	}

	_fadeTransitionTime
	_overlay
	_transitionItems

	_sharedProgress
	_hiddenProgress

	_transitionProgress
	_transitionProgressListener

	_resolveLayoutPromise
	_resolveLayoutFunc

	_resolveChildLayoutPromise
	_resolveChildLayoutFunc

	_isMounted
	_appearTransitionPromise
	_appearTransitionPromiseResolve

	async onTransitionStart(props, prevProps, config) {

		// Wait for self layout
		await this._resolveLayoutPromise;

		console.log("");
		console.log("TransitionItemsView onTransitionStart");

		// Get routes and direction
		const toRoute = props.scene.route.routeName;
		const fromRoute = prevProps ? prevProps.scene.route.routeName : "UNKNOWN";
		const direction = props.index > (prevProps ? prevProps.index : 9999) ? 1 : -1;

		this.setState({...this.state, fromRoute, toRoute, direction});

		// Get items in transition
		const sharedElements = this._transitionItems.getSharedElements(fromRoute, toRoute);
		const transitionElements = this._transitionItems.getTransitionElements(fromRoute, toRoute);

		if(sharedElements.length === 0 && transitionElements.length === 0){
			this._sharedProgress.setValue(1);
			return false;
		}

		await new Promise(resolve => this._resolveChildLayoutFunc = resolve);
		console.log("TransitionItemsView onTransitionStart begin items measure...");
		await this.measureItems(sharedElements, transitionElements);
		console.log("TransitionItemsView onTransitionStart items measure done");

		// Extend state with information about shared elements and appear elements
		this.setState({
			...this.state,
			sharedElements: sharedElements,
			transitionElements: transitionElements,
			config,
			direction,
			progress: props.progress
		});

		if(sharedElements.length > 0){
			// We should now have the overlay ready
			await this.runAppearAnimation(1.0, config);
		}

		// Show all items - they should now have their initial values set correctly
		// to begin their transition
		this._hiddenProgress.setValue(1);

		return true;

		// Start transitions: TODO: setup individual animation to handle delays
		// const { timing } = config;
		// delete config.timing;
		// timing(this._transitionProgress, {
		// 	toValue: 1.0,
		// 	...config
		// }).start();
	}

	async onTransitionEnd(props, prevProps, config) {
		console.log("TransitionItemsView onTransitionEnd");
		if(this.state.toRoute && this.state.fromRoute){
			const sharedElements = this._transitionItems.getSharedElements(
				this.state.fromRoute, this.state.toRoute);

			if(sharedElements.length > 0)
				await this.runAppearAnimation(0.0, config);

			this.resetState();
		}
	}

	resetState() {
		this.setState({
			...this.state,
			sharedElements: null,
			transitionElements: null,
			config: null,
			progress: null
		});
	}

	runAppearAnimation(toValue, config){

		// console.log("TransitionItemsView runAppearAnimation " + toValue);

		// Run swap animation
		let swapAnimationDone = null;
		const swapPromise = new Promise((resolve, reject) =>
			swapAnimationDone = resolve);

		Animated.timing(this._sharedProgress, {
			toValue: toValue,
			duration: this._fadeTransitionTime,
			easing: Easing.linear,
			useNativeDriver : config.useNativeDriver,
		}).start(swapAnimationDone);

		return swapPromise;
	}

	render() {
		// console.log("TransitionItemsView: render");
		return(
			<View
				style={styles.container}				
				ref={(ref) => this._viewRef = ref}
			>
				{this.props.children}
				<TransitionOverlayView
					pairs={this.state.sharedElements}
					progress={this.state.progress}
				/>
			</View>
		);
	}

	layoutReady(name, route) {
		const sharedElements = this._transitionItems.getSharedElements(
			this.state.fromRoute, this.state.toRoute);

		const transitionElements = this._transitionItems.getTransitionElements(
			this.state.fromRoute, this.state.toRoute);

		const item = this._transitionItems.getItemByNameAndRoute(name, route);
		if(!item){
			// a stray element that will be removed - lets just bail out
			return;
		}
		item.layoutRead = true;
		
		if(sharedElements.length === 0 && transitionElements.length === 0) return;

		// resolve layout read
		for(let i=0; i<sharedElements.length; i++){
			if(!sharedElements[i].fromItem.layoutRead)
				return;

			if(!sharedElements[i].toItem.layoutRead)
				return;
		}
		for(let i=0; i<transitionElements.length; i++)
			if(!transitionElements[i].layoutRead)
				return;

		if(this._resolveChildLayoutFunc){
			this._resolveChildLayoutFunc();
			this._resolveChildLayoutFunc = null;
		}
	}

	async measureItems(sharedElements, transitionElements) {		
		let resolveFunc;
		let viewMetrics = {};
		const promise = new Promise(resolve => resolveFunc = resolve);
		const nodeHandle = findNodeHandle(this._viewRef);
		UIManager.measureInWindow(nodeHandle, (x, y, width, height) => {
			viewMetrics = {x, y, width, height };			
			resolveFunc();
		});		
		
		await promise;

		for(let i=0; i<sharedElements.length; i++){
			const pair = sharedElements[i];
			await this.measureItem(viewMetrics, pair.fromItem, nodeHandle);
			await this.measureItem(viewMetrics, pair.toItem, nodeHandle);
		}

		for(let i=0; i<transitionElements.length; i++){
			await this.measureItem(viewMetrics, transitionElements[i], nodeHandle);
		}
	}

	async measureItem(viewMetrics, item, parentNodeHandle){
		if(item.metrics)
			return;

		const self = this;
		return new Promise((resolve, reject) => {
			console.log("TransitionItemsView measureItem " + item.name + ", " + item.route);
			UIManager.measureInWindow(item.reactElement.getNodeHandle(), (x, y, width, height) => {
				console.log("TransitionItemsView measureItem success " + item.name + ", " + item.route);
				item.metrics = {x: x - viewMetrics.x, y: y - viewMetrics.y, width, height };
				resolve();
			});
		});
	}

	getMetrics(name, route) {
		const item = this._transitionItems.getItemByNameAndRoute(name, route);
		return item.metrics;
	}

	getDirection(name, route) {
		if(route === this.state.toRoute)
			return 1;
		else
			return -1;
	}

	getReverse(route) {
		return route === this.state.fromRoute;
	}

	getIsSharedElement(name, route) {
		if(this.state.sharedElements){
			return this.state.sharedElements.findIndex(pair =>
				(pair.fromItem.name === name && pair.fromItem.route === route) ||
				(pair.toItem.name === name && pair.toItem.route === route)
			) > -1;
		}
		return false;
	}

	getIsTransitionElement(name, route) {
		const item = this._transitionItems.getItemByNameAndRoute(name, route);
		return item && item.appear && !this.getIsSharedElement(name, route);
	}

	shouldComponentUpdate(nextProps, nextState) {
		return this.state != nextState;
	}

	componentDidMount() {
		this._isMounted = true;
	}

	componentWillUnmount() {
		this._isMounted = false;
	}

	static childContextTypes = {
		register: PropTypes.func,
		unregister: PropTypes.func,
		getDirection: PropTypes.func,
		getReverse: PropTypes.func,
		sharedProgress: PropTypes.object,
		hiddenProgress: PropTypes.object,
		transitionProgress: PropTypes.func,
		getIsSharedElement: PropTypes.func,
		getIsTransitionElement: PropTypes.func,
		layoutReady: PropTypes.func,
		getMetrics: PropTypes.func
	}

	getChildContext() {
		const self = this;
		return {
			register: (item) => this._transitionItems.add(item),
			unregister: (name, route) => this._transitionItems.remove(name, route),
			sharedProgress: this._sharedProgress,
			hiddenProgress: this._hiddenProgress,
			getDirection: this.getDirection.bind(this),
			getReverse: this.getReverse.bind(this),
			transitionProgress: ()=> this.state.progress,
			getIsSharedElement: this.getIsSharedElement.bind(this),
			getIsTransitionElement: this.getIsTransitionElement.bind(this),
			layoutReady: this.layoutReady.bind(this),
			getMetrics: this.getMetrics.bind(this),
		};
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	}
});
