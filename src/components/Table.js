import HeaderCell from './HeaderCell';
import TableLoader from './loaders/Table';
import TableDeltaHelper from './snippets/TableDeltaHelper';

import {TABLE_FADE_IN, TABLE_FADE_OUT} from '../animations';
import {
  DISTRICT_TABLE_COUNT,
  STATE_NAMES,
  STATISTIC_CONFIGS,
  TABLE_STATISTICS,
  TABLE_STATISTICS_EXPANDED,
  UNASSIGNED_STATE_CODE,
} from '../constants';
import {getStatistic, getTableStatistic, retry} from '../utils/commonFunctions';

import {
  FilterIcon,
  FoldDownIcon,
  InfoIcon,
  OrganizationIcon,
  QuestionIcon,
} from '@primer/octicons-react';
import classnames from 'classnames';
import equal from 'fast-deep-equal';
import produce from 'immer';
import {memo, useCallback, useEffect, useMemo, useState, lazy} from 'react';
import {
  ChevronLeft,
  ChevronsLeft,
  ChevronRight,
  ChevronsRight,
} from 'react-feather';
import {useTranslation} from 'react-i18next';
import {Link} from 'react-router-dom';
import {useTrail, useTransition, animated, config} from 'react-spring';
import {useKeyPressEvent, useSessionStorage} from 'react-use';
// eslint-disable-next-line
import worker from 'workerize-loader!../workers/getDistricts';

const Row = lazy(() => retry(() => import('./Row')));

function Table({
  data: states,
  date: timelineDate,
  regionHighlighted,
  setRegionHighlighted,
  expandTable,
  setExpandTable,
  hideDistrictData,
  hideVaccinated,
  lastUpdatedDate,
}) {
  const {t} = useTranslation();
  const [sortData, setSortData] = useSessionStorage('sortData', {
    sortColumn: 'confirmed',
    isAscending: false,
    delta: false,
  });
  const [page, setPage] = useState(0);

  const handleSortClick = useCallback(
    (statistic) => {
      if (sortData.sortColumn !== statistic) {
        setSortData(
          produce(sortData, (draftSortData) => {
            draftSortData.sortColumn = statistic;
          })
        );
      } else {
        setSortData(
          produce(sortData, (draftSortData) => {
            draftSortData.isAscending = !sortData.isAscending;
          })
        );
      }
    },
    [sortData, setSortData]
  );

  const trail = useTrail(3, {
    from: {transform: 'translate3d(0, 10px, 0)', opacity: 0},
    to: {transform: 'translate3d(0, 0px, 0)', opacity: 1},
    config: config.wobbly,
  });

  const [allDistricts, setAllDistricts] = useState();

  const [tableOption, setTableOption] = useState('States');
  const [isPerLakh, setIsPerLakh] = useState(false);
  const [isInfoVisible, setIsInfoVisible] = useState(false);

  const districts = useMemo(() => {
    if (!isPerLakh) {
      return allDistricts;
    } else {
      return Object.keys(allDistricts || {})
        .filter(
          (districtKey) =>
            getStatistic(allDistricts[districtKey], 'total', 'population') > 0
        )
        .reduce((res, districtKey) => {
          res[districtKey] = allDistricts[districtKey];
          return res;
        }, {});
    }
  }, [isPerLakh, allDistricts]);

  const numPages = Math.ceil(
    Object.keys(districts || {}).length / DISTRICT_TABLE_COUNT
  );

  const sortingFunction = useCallback(
    (regionKeyA, regionKeyB) => {
      if (sortData.sortColumn !== 'regionName') {
        const statisticConfig = STATISTIC_CONFIGS[sortData.sortColumn];
        const dataType =
          sortData.delta && statisticConfig?.tableConfig?.showDelta
            ? 'delta'
            : 'total';

        const statisticA = getTableStatistic(
          districts?.[regionKeyA] || states[regionKeyA],
          sortData.sortColumn,
          {
            expiredDate: lastUpdatedDate,
            normalizedByPopulationPer: isPerLakh ? 'lakh' : null,
          }
        )[dataType];
        const statisticB = getTableStatistic(
          districts?.[regionKeyB] || states[regionKeyB],
          sortData.sortColumn,
          {
            expiredDate: lastUpdatedDate,
            normalizedByPopulationPer: isPerLakh ? 'lakh' : null,
          }
        )[dataType];
        return sortData.isAscending
          ? statisticA - statisticB
          : statisticB - statisticA;
      } else {
        const regionNameA =
          districts?.[regionKeyA]?.districtName || STATE_NAMES[regionKeyA];
        const regionNameB =
          districts?.[regionKeyB]?.districtName || STATE_NAMES[regionKeyB];
        return sortData.isAscending
          ? regionNameA.localeCompare(regionNameB)
          : regionNameB.localeCompare(regionNameA);
      }
    },
    [
      districts,
      isPerLakh,
      lastUpdatedDate,
      sortData.delta,
      sortData.isAscending,
      sortData.sortColumn,
      states,
    ]
  );

  const _setTableOption = useCallback(() => {
    setTableOption((prevTableOption) =>
      prevTableOption === 'States' ? 'Districts' : 'States'
    );
  }, []);

  useEffect(() => {
    const workerInstance = worker();
    workerInstance.getDistricts(states);
    workerInstance.addEventListener('message', (message) => {
      if (message.data.type !== 'RPC') {
        setAllDistricts(message.data);
        workerInstance.terminate();
      }
    });
  }, [tableOption, states]);

  useEffect(() => {
    setPage((p) => Math.max(0, Math.min(p, numPages - 1)));
  }, [numPages]);

  const handlePageClick = (direction) => {
    if (Math.abs(direction) === 1) {
      setPage(Math.min(Math.max(0, page + direction), numPages - 1));
    } else if (direction < 0) {
      setPage(0);
    } else if (direction > 0) {
      setPage(numPages - 1);
    }
  };

  const transition = useTransition(isInfoVisible, {
    from: TABLE_FADE_OUT,
    enter: TABLE_FADE_IN,
    leave: TABLE_FADE_OUT,
  });

  const tableStatistics = (
    expandTable ? TABLE_STATISTICS_EXPANDED : TABLE_STATISTICS
  ).filter(
    (statistic) =>
      !(STATISTIC_CONFIGS[statistic]?.category === 'vaccinated') ||
      !hideVaccinated
  );

  const showDistricts = tableOption === 'Districts' && !hideDistrictData;

  useEffect(() => {
    if (!showDistricts) setPage(0);
  }, [showDistricts]);

  useKeyPressEvent('?', () => {
    setIsInfoVisible(!isInfoVisible);
  });

  return (
    <div className="Table">
      <div className="table-top">
        <animated.div
          className={classnames('option-toggle', {
            'is-highlighted': showDistricts,
          })}
          onClick={_setTableOption}
          style={trail[0]}
        >
          <OrganizationIcon size={14} />
        </animated.div>

        <animated.div
          className={classnames('lakh-toggle', {
            'is-highlighted': isPerLakh,
          })}
          onClick={setIsPerLakh.bind(this, !isPerLakh)}
          style={trail[0]}
        >
          <span>1L </span>
        </animated.div>

        <animated.div
          className={classnames('info-toggle', {
            'is-highlighted': isInfoVisible,
          })}
          onClick={setIsInfoVisible.bind(this, !isInfoVisible)}
          style={trail[0]}
        >
          <QuestionIcon size={14} />
        </animated.div>

        <animated.div
          className={classnames('expand-table-toggle', {
            'is-highlighted': expandTable,
          })}
          style={trail[1]}
          onClick={setExpandTable.bind(this, !expandTable)}
        >
          <FoldDownIcon size={16} />
        </animated.div>
      </div>

      {transition(
        (style, item) =>
          item && (
            <animated.div className="table-helper" {...{style}}>
              <div className="helper-top">
                <div className="helper-left">
                  <div className="info-item">
                    <span>
                      <OrganizationIcon size={14} />
                    </span>
                    <p>{t('Toggle between States/Districts')}</p>
                  </div>

                  <div className="info-item">
                    <h5>1L</h5>
                    <p>{t('Per Lakh People')}</p>
                  </div>

                  <div className="info-item sort">
                    <span>
                      <FilterIcon size={14} />
                    </span>
                    <p>{t('Sort by Descending')}</p>
                  </div>

                  <div className="info-item sort invert">
                    <span>
                      <FilterIcon size={14} />
                    </span>
                    <p>{t('Sort by Ascending')}</p>
                  </div>

                  <div className="info-item sort">
                    <TableDeltaHelper />
                  </div>

                  <div className="info-item notes">
                    <span>
                      <InfoIcon size={15} />
                    </span>
                    <p>{t('Notes')}</p>
                  </div>
                </div>
                <div className="helper-right">
                  <div className="info-item">
                    <p>{t('Units')}</p>
                  </div>
                  {Object.entries({'1K': 3, '1L': 5, '1Cr': 7}).map(
                    ([abbr, exp]) => (
                      <div className="info-item" key={abbr}>
                        <h5>{abbr}</h5>
                        <p>
                          10
                          <sup
                            style={{
                              verticalAlign: 'baseline',
                              position: 'relative',
                              top: '-.4em',
                            }}
                          >
                            {exp}
                          </sup>
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>

              <h5 className="text">
                {t('Compiled from State Govt. numbers')},{' '}
                <Link to="/about">{t('know more')}!</Link>
              </h5>
            </animated.div>
          )
      )}

      <div className="table-container">
        <div
          className="table fadeInUp"
          style={{
            gridTemplateColumns: `repeat(${tableStatistics.length + 1}, auto)`,
          }}
        >
          <div className="row heading">
            <div
              className="cell heading"
              onClick={handleSortClick.bind(this, 'regionName')}
            >
              <div>{t(!showDistricts ? 'State/UT' : 'District')}</div>
              {sortData.sortColumn === 'regionName' && (
                <div
                  className={classnames('sort-icon', {
                    invert: sortData.isAscending,
                  })}
                >
                  <FilterIcon size={10} />
                </div>
              )}
            </div>

            {tableStatistics.map((statistic) => (
              <HeaderCell
                key={statistic}
                {...{statistic, sortData, setSortData}}
                handleSort={handleSortClick.bind(this, statistic)}
              />
            ))}
          </div>

          {!showDistricts &&
            Object.keys(states)
              .filter(
                (stateCode) =>
                  stateCode !== 'TT' &&
                  !(stateCode === UNASSIGNED_STATE_CODE && isPerLakh)
              )
              .sort((a, b) => sortingFunction(a, b))
              .map((stateCode) => {
                return (
                  <Row
                    key={stateCode}
                    data={states[stateCode]}
                    {...{
                      stateCode,
                      isPerLakh,
                      regionHighlighted,
                      setRegionHighlighted,
                      expandTable,
                      lastUpdatedDate,
                      tableStatistics,
                    }}
                  />
                );
              })}

          {showDistricts && !districts && <TableLoader />}

          {showDistricts &&
            districts &&
            Object.keys(districts)
              .sort((a, b) => sortingFunction(a, b))
              .slice(
                page * DISTRICT_TABLE_COUNT,
                (page + 1) * DISTRICT_TABLE_COUNT
              )
              .map((districtKey) => {
                return (
                  <Row
                    key={districtKey}
                    data={districts[districtKey]}
                    districtName={districts[districtKey].districtName}
                    {...{
                      isPerLakh,
                      regionHighlighted,
                      setRegionHighlighted,
                      expandTable,
                      lastUpdatedDate,
                      tableStatistics,
                    }}
                  />
                );
              })}

          <Row
            key={'TT'}
            data={states['TT']}
            stateCode={'TT'}
            {...{
              isPerLakh,
              regionHighlighted,
              setRegionHighlighted,
              expandTable,
              lastUpdatedDate,
              tableStatistics,
            }}
          />
        </div>
      </div>
      {showDistricts && (
        <div className="paginate">
          <div
            className={classnames('left', {disabled: page === 0})}
            onClick={handlePageClick.bind(this, -2)}
          >
            <ChevronsLeft size={16} />
          </div>
          <div
            className={classnames('left', {disabled: page === 0})}
            onClick={handlePageClick.bind(this, -1)}
          >
            <ChevronLeft size={16} />
          </div>
          <h5>{`${page + 1} / ${numPages}`}</h5>
          <div
            className={classnames('right', {disabled: page === numPages - 1})}
            onClick={handlePageClick.bind(this, 1)}
          >
            <ChevronRight size={16} />
          </div>
          <div
            className={classnames('right', {disabled: page === numPages - 1})}
            onClick={handlePageClick.bind(this, 2)}
          >
            <ChevronsRight size={16} />
          </div>
        </div>
      )}
    </div>
  );
}

const isEqual = (prevProps, currProps) => {
  if (
    !equal(
      prevProps.regionHighlighted?.districtName,
      currProps.regionHighlighted?.districtName
    )
  ) {
    return false;
  } else if (
    !equal(
      prevProps.regionHighlighted?.stateCode,
      currProps.regionHighlighted?.stateCode
    )
  ) {
    return false;
  } else if (!equal(prevProps.date, currProps.date)) {
    return false;
  } else if (!equal(prevProps.hideDistrictData, currProps.hideDistrictData)) {
  } else if (!equal(prevProps.hideVaccinated, currProps.hideVaccinated)) {
    return false;
  } else if (
    !equal(
      prevProps.data['TT'].total.confirmed,
      currProps.data['TT'].total.confirmed
    )
  ) {
    return false;
  } else if (!equal(prevProps.expandTable, currProps.expandTable)) {
    return false;
  } else return true;
};

export default memo(Table, isEqual);
