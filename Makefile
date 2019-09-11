default: build

setup:
	yarn
build: setup
	yarn build
watch: setup
	yarn watch