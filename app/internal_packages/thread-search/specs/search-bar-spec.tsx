/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import { Actions, ComponentRegistry } from 'mailspring-exports';

import ThreadSearchBar from '../lib/thread-search-bar';

describe('ThreadSearchBar', function () {
  beforeEach(function () {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    this.searchBar = ReactTestUtils.renderIntoDocument(<ThreadSearchBar />);
    this.input = (ReactDOM.findDOMNode(this.searchBar) as HTMLElement).querySelector(
      '[contenteditable]'
    );
  });

  it('preserves capitalization on searches', function () {
    spyOn(Actions, 'searchQueryChanged');
    const test = 'HeLlO wOrLd';
    ReactTestUtils.Simulate.input(this.input, { target: { innerText: test } as any });
    expect(Actions.searchQueryChanged).toHaveBeenCalledWith(test);
  });

  it('shows the ask placeholder when a component registers for the Ask role', function () {
    const Dummy = () => null;
    Dummy.displayName = 'DummyAsk';
    ComponentRegistry.register(Dummy, { role: 'ThreadSearchBar:Ask' });
    try {
      const el = document.createElement('div');
      ReactDOM.render(<ThreadSearchBar />, el);
      expect(el.textContent).toContain('Search, or ask about your mail');
    } finally {
      ComponentRegistry.unregister(Dummy);
    }
  });
});
