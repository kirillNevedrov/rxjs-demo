import React, { Component } from 'react';
import { findIndex, lensPath, over, append, map } from 'ramda';
import { Subject } from 'rxjs/Subject';
import { withLatestFrom, switchMap, mergeMap, takeUntil, startWith, map as mapRx, catchError, retry, retryWhen, delay, tap } from 'rxjs/operators';
import Button from 'material-ui/Button';
import Typography from 'material-ui/Typography';
import Tooltip from 'material-ui/Tooltip';
import { fromPromise } from 'rxjs/observable/fromPromise';
import { of } from 'rxjs/observable/of';
import { interval } from 'rxjs/observable/interval';
import { defer } from 'rxjs/observable/defer';

import './App.css';

let id = 1;
let getId = () => {
  let result = id;
  id = id + 1;
  return result;
}
let resetId = () => {
  id = 1;
}

let names = [
  'Ruth Schultz',
  'Deborah Morales',
  'Tammy Jacobs',
  'Benjamin Wells',
  'Elizabeth Bailey',
  'Gloria James',
  'Shirley Kelley',
  'Judy Richardson',
  'Maria Baker',
  'Janice Chavez',
  'Tiffany Guzman',
  'Jeffrey Greene',
  'Katherine Woods',
  'Judith Peters',
  'Randy Ross'
];
let nameIndex = 0;
let getName = () => {
  if (nameIndex > names.length - 1) {
    nameIndex = 0;
  }
  let result = names[nameIndex];
  nameIndex = nameIndex + 1;
  return result;
}
let resetName = () => {
  nameIndex = 0;
}

class App extends Component {
  constructor(props) {
    super(props);

    let now = new Date().getTime();

    this.resetStream = new Subject();    

    this.stream1 = new Subject();
    
    let attempt = 0;
    this.stream2 = this.stream1.pipe(
      switchMap(event => {
        let id = event.id;
        console.log('started', id);
        attempt = 0;

        return defer(() => {
          console.log('defered', id)
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              if (id > 5 && attempt > 3) {
                resolve({ data: { user: { name: getName() } } });
              }
              else {
                reject({ type: 'failed', data: id });
              }
            }, 2000)
          });
        })
          .pipe(
            mapRx(response => {
              return { id, type: 'succeed', payload: response.data.user };
            }),
            retryWhen(errors => {
              return errors.pipe(
                tap((data) => {
                  attempt++;
                  console.log(data, attempt)
                }),
                delay(100)
              );
            }),
            // catchError(() => of({ id, type: 'failed' })),
            startWith({ id, type: 'requested' })
          );
      })
    );

    // this.stream2 = new Subject();
    // this.stream3 = this.stream1.pipe(
    //   withLatestFrom(this.stream2)
    // );
    // this.stream4 = this.stream3.pipe(
    //   switchMap(event => {
    //     let id = event[0].id;

    //     return fromPromise(
    //       new Promise((resolve, reject) => {
    //         setTimeout(() => {
    //           resolve({ data: { user: { name: getName() } } });
    //           // reject();
    //         }, 2000)
    //       })
    //     ).pipe(
    //       mapRx(response => ({ id, type: 'succeed', payload: response.data.user })),
    //       catchError(() => of({ id, type: 'failed' })),
    //       startWith({ id, type: 'requested' })
    //     );
    //   })
    // );

    this._syncState = {
      now,
      speed: 100,
      streams: [
        {
          id: 1,
          events: [],
          stream: this.stream1,
          color: 'green',
          title: 'requested',
          getPayload: () => {
            return { id: getId() };
          }
        },
        {
          id: 2,
          events: [],
          isCombined: true,
          stream: this.stream2,
          color: 'red',
          title: 'retry'
        },
        // {
        //   id: 2,
        //   events: [],
        //   stream: this.stream2,
        //   color: 'red',
        //   title: 'state',
        //   getPayload: () => {
        //     return { user: { name: getName() } };
        //   }
        // },
        // {
        //   id: 3,
        //   events: [],
        //   isCombined: true,
        //   stream: this.stream3,
        //   color: 'blue',
        //   title: 'withLatestFrom'
        // },
        // {
        //   id: 4,
        //   events: [],
        //   isCombined: true,
        //   stream: this.stream4,
        //   color: 'yellow',
        //   title: 'switchMap'
        // }
      ],
      isPaused: false
    };

    this.state = this._syncState;

    this._subscribe();
  }

  _subscribe() {
    this.stream1.pipe(takeUntil(this.resetStream)).subscribe(payload => {
      this.addEvent(1, payload);
    });

    this.stream2.pipe(takeUntil(this.resetStream)).subscribe(payload => {
      this.addEvent(2, payload);
    });

    // this.stream3.pipe(takeUntil(this.resetStream)).subscribe(payload => {
    //   this.addEvent(3, payload);
    // });

    // this.stream4.pipe(takeUntil(this.resetStream)).subscribe(payload => {
    //   this.addEvent(4, payload);
    // });
  }

  componentDidMount() {
    let updateNow = () => {
      if (!this.state.isPaused) {
        this._syncSetState(state => ({
          ...state,
          now: state.now + (1000 / 60)
        }));
      }

      requestAnimationFrame(updateNow);
    };

    updateNow();
  }

  _syncSetState(setter) {
    this._syncState = setter(this._syncState);
    this.setState(this._syncState);
  }

  addEvent(streamId, payload) {
    let streamIndex = findIndex(stream => stream.id === streamId, this.state.streams);

    this._syncSetState(state => over(
      lensPath(['streams', streamIndex, 'events']),
      events => append({
        id: getId(),
        time: state.now,
        payload: JSON.stringify(payload)
      }, events),
      state
    ));
  }

  raiseEvent = (streamId) => {
    let streamIndex = findIndex(stream => stream.id === streamId, this.state.streams);
    let stream = this.state.streams[streamIndex];

    stream.stream.next(stream.getPayload());
  }

  togglePause = () => {
    this._syncSetState(state => ({
      ...state,
      isPaused: !state.isPaused
    }));
  }

  reset = () => {
    this.resetStream.next();

    this._syncSetState(state => ({
      ...state,
      streams: map(stream => ({ ...stream, events: [] }), state.streams)
    }));

    resetId();
    resetName();

    this._subscribe();
  }

  render() {
    return (
      <div className='content'>
        <div>
          {this.state.streams.map(stream => {
            return (
              <div className='stream' key={stream.id}>
                <div>
                  {stream.events.map(event => {
                    return (
                      <Tooltip
                        title={event.payload}
                        classes={{
                          tooltip: 'tooltip'
                        }}
                        key={event.id}
                      >
                        <div
                          className='event'
                          style={{
                            backgroundColor: stream.color,
                            right: `${Math.min(5000, ((this.state.now - event.time) / 1000) * this.state.speed)}px`
                          }}
                        >
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
                {stream.isCombined ?
                  (
                    <div>
                      <Typography style={{ padding: '8px 16px', fontWeight: '500' }}>({stream.title})</Typography>
                    </div>
                  ) :
                  (
                    <div>
                      <Button variant="raised" onClick={() => this.raiseEvent(stream.id)}>Add Event ({stream.title})</Button>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
        <div>
          <Button variant="raised" color="primary" onClick={this.togglePause} style={{ marginRight: '8px' }}>Pause/Start</Button>
          <Button variant="raised" color="primary" onClick={this.reset}>Reset</Button>
        </div>
      </div>
    );
  }
}

export default App;
